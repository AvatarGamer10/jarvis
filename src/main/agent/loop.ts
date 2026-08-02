import { randomUUID } from 'node:crypto'
import type { ChatMessage, PendingAction, ToolCallRecord } from '@shared/types'
import { LlmError, type ConversationItem, type LLMProvider, type ToolCall } from './provider'
import { systemPrompt } from './prompt'
import { toolByName, TOOLS, type Tool, type ToolContext } from './tools'

/**
 * Tope de vueltas del bucle. Sin esto, un modelo que se atasca llamando a la
 * misma herramienta puede vaciar la cuota diaria en un minuto.
 */
const MAX_STEPS = 6

/** Turnos que se conservan. La conversacion entera acabaria costando demasiados tokens. */
const MAX_HISTORY = 40

interface PendingBatch {
  action: PendingAction
  /** Lote completo de llamadas que pidio el modelo. */
  calls: ToolCall[]
  /** Indice de la que esta esperando confirmacion. */
  index: number
  args: unknown
}

export class AgentService {
  private history: ConversationItem[] = []
  private pending: PendingBatch | null = null

  constructor(
    private readonly provider: LLMProvider,
    private readonly context: () => ToolContext
  ) {}

  reset(): void {
    this.history = []
    this.pending = null
  }

  /** Manda un mensaje del usuario y devuelve los mensajes nuevos del asistente. */
  async send(text: string): Promise<ChatMessage[]> {
    // Un mensaje nuevo invalida cualquier confirmacion a medias: el usuario ha
    // seguido a otra cosa.
    this.pending = null
    this.history.push({ role: 'user', text })
    this.trim()
    return this.run([])
  }

  /** Resuelve una confirmacion pendiente y sigue desde donde se quedo. */
  async confirm(actionId: string, approved: boolean): Promise<ChatMessage[]> {
    const batch = this.pending
    if (!batch || batch.action.id !== actionId) {
      throw new Error('Esa accion ya no esta pendiente.')
    }
    this.pending = null

    const produced: ChatMessage[] = []
    const records: ToolCallRecord[] = []

    if (approved) {
      const call = batch.calls[batch.index]
      const tool = toolByName(call.name)
      if (!tool) throw new Error(`La herramienta "${call.name}" ya no existe.`)
      await this.runOne(tool, call, batch.args, records)
    } else {
      const call = batch.calls[batch.index]
      this.history.push({
        role: 'tool',
        name: call.name,
        response: { cancelado: true, motivo: 'El usuario no ha autorizado la accion.' }
      })
      records.push({ name: call.name, args: call.args, summary: 'Cancelada por el usuario.', ok: false })
    }

    // El modelo espera una respuesta por cada llamada que hizo. Las que quedaron
    // detras de la confirmacion se responden como no ejecutadas.
    const paused = await this.consume(batch.calls, batch.index + 1, records, produced)
    if (paused) return produced

    return this.run(produced, records)
  }

  // ------------------------------------------------------------------------

  private async run(produced: ChatMessage[], carried: ToolCallRecord[] = []): Promise<ChatMessage[]> {
    let records = carried

    for (let step = 0; step < MAX_STEPS; step++) {
      let reply
      try {
        reply = await this.provider.complete({
          system: systemPrompt(),
          history: this.history,
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }))
        })
      } catch (err) {
        // Si el modelo falla dejamos la conversacion como estaba antes de la
        // llamada, para que reintentar no arrastre un historial roto.
        const message = err instanceof LlmError ? err.message : (err as Error).message
        produced.push(this.assistantMessage(message, records))
        return produced
      }

      this.history.push({
        role: 'assistant',
        text: reply.text ?? undefined,
        toolCalls: reply.toolCalls.length > 0 ? reply.toolCalls : undefined
      })

      if (reply.toolCalls.length === 0) {
        produced.push(this.assistantMessage(reply.text ?? 'No he sabido que responder.', records))
        return produced
      }

      // Si el modelo ha escrito algo antes de usar las herramientas, se muestra.
      if (reply.text) produced.push(this.assistantMessage(reply.text, []))

      const paused = await this.consume(reply.toolCalls, 0, records, produced)
      if (paused) return produced

      records = []
      this.trim()
    }

    produced.push(
      this.assistantMessage(
        'He dado demasiadas vueltas sin llegar a una respuesta. Prueba a pedirmelo de otra forma.',
        records
      )
    )
    return produced
  }

  /**
   * Ejecuta las llamadas desde `from`. Devuelve true si se ha parado a esperar
   * una confirmacion del usuario.
   */
  private async consume(
    calls: ToolCall[],
    from: number,
    records: ToolCallRecord[],
    produced: ChatMessage[]
  ): Promise<boolean> {
    for (let i = from; i < calls.length; i++) {
      const call = calls[i]
      const tool = toolByName(call.name)

      if (!tool) {
        this.history.push({
          role: 'tool',
          name: call.name,
          response: { error: `No existe ninguna herramienta llamada "${call.name}".` }
        })
        records.push({ name: call.name, args: call.args, summary: 'Herramienta desconocida.', ok: false })
        continue
      }

      // El modelo se equivoca con los argumentos mas de lo que parece. Validar
      // aqui evita, por ejemplo, crear un evento con una fecha imposible.
      const parsed = tool.schema.safeParse(call.args)
      if (!parsed.success) {
        const detail = parsed.error.issues.map((issue) => issue.message).join('; ')
        this.history.push({
          role: 'tool',
          name: call.name,
          response: { error: `Argumentos invalidos: ${detail}` }
        })
        records.push({ name: call.name, args: call.args, summary: `Argumentos invalidos: ${detail}`, ok: false })
        continue
      }

      if (tool.requiresConfirmation) {
        const described = tool.describe?.(parsed.data as never) ?? {
          description: `Ejecutar ${tool.name}`,
          details: []
        }
        const action: PendingAction = {
          id: randomUUID(),
          tool: tool.name,
          args: call.args,
          ...described
        }
        this.pending = { action, calls, index: i, args: parsed.data }
        produced.push({
          id: randomUUID(),
          role: 'assistant',
          text: described.description,
          at: new Date().toISOString(),
          toolCalls: records.length > 0 ? [...records] : undefined,
          pendingAction: action
        })
        return true
      }

      await this.runOne(tool, call, parsed.data, records)
    }

    return false
  }

  private async runOne(
    tool: Tool<never>,
    call: ToolCall,
    args: unknown,
    records: ToolCallRecord[]
  ): Promise<void> {
    try {
      const result = await tool.execute(args as never, this.context())
      this.history.push({ role: 'tool', name: call.name, response: result.data })
      records.push({ name: call.name, args: call.args, summary: result.summary, ok: true })
    } catch (err) {
      const message = (err as Error).message
      // El error va al historial para que el modelo pueda explicarselo al
      // usuario en vez de quedarse callado.
      this.history.push({ role: 'tool', name: call.name, response: { error: message } })
      records.push({ name: call.name, args: call.args, summary: message, ok: false })
    }
  }

  private assistantMessage(text: string, records: ToolCallRecord[]): ChatMessage {
    return {
      id: randomUUID(),
      role: 'assistant',
      text,
      at: new Date().toISOString(),
      toolCalls: records.length > 0 ? [...records] : undefined
    }
  }

  /**
   * Recorta el historial sin partir un par llamada/respuesta por la mitad:
   * si Gemini recibe un functionResponse cuyo functionCall ya no esta, falla.
   */
  private trim(): void {
    if (this.history.length <= MAX_HISTORY) return

    let cut = this.history.length - MAX_HISTORY
    while (cut < this.history.length && this.history[cut].role !== 'user') cut++
    this.history = this.history.slice(cut)
  }
}
