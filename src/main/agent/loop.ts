import { randomUUID } from 'node:crypto'
import type { ChatMessage, ChatSummary, PendingAction, ToolCallRecord } from '@shared/types'
import type { ChatStore } from './chat-store'
import { LlmError, type ConversationItem, type LLMProvider, type ToolCall } from './provider'
import { systemPrompt } from './prompt'
import { toolByName, TOOLS, type Tool, type ToolContext } from './tools'

/**
 * Ceiling on loop iterations. Without it, a model that gets stuck calling the
 * same tool can empty the daily quota in a minute.
 */
const MAX_STEPS = 6

/** Turns kept. The whole conversation would end up costing too many tokens. */
const MAX_HISTORY = 40

interface PendingBatch {
  action: PendingAction
  /** The full batch of calls the model asked for. */
  calls: ToolCall[]
  /** Index of the one waiting on confirmation. */
  index: number
  args: unknown
}

export class AgentService {
  private history: ConversationItem[]
  private pending: PendingBatch | null = null

  constructor(
    private readonly provider: LLMProvider,
    private readonly context: () => ToolContext,
    private readonly store: ChatStore
  ) {
    // The conversation survives restarts: without this, closing the app erased
    // everything said and the assistant remembered nothing from one day to the
    // next.
    this.history = store.context()
  }

  /** What to paint when the chat opens. */
  mensajesGuardados(): ChatMessage[] {
    return this.store.messages()
  }

  reset(): void {
    this.history = []
    this.pending = null
    this.store.clear()
  }

  /** Earlier conversations, for the history list. */
  conversations(): ChatSummary[] {
    return this.store.history()
  }

  /**
   * Files the conversation in progress away and starts another.
   *
   * The in-memory context is discarded too, which is the easy part to forget:
   * clearing only the file would leave the model still dragging everything
   * that came before into the next question.
   */
  newConversation(): void {
    this.history = []
    this.pending = null
    this.store.archiveCurrent()
  }

  openConversation(id: string): ChatMessage[] {
    this.pending = null
    const mensajes = this.store.open(id)
    this.history = this.store.context()
    return mensajes
  }

  deleteConversation(id: string): void {
    this.store.remove(id)
  }

  /** Sends a user message and returns the assistant's new messages. */
  async send(text: string): Promise<ChatMessage[]> {
    // A new message invalidates any half-finished confirmation: the user has
    // seguido a otra cosa.
    this.pending = null
    this.history.push({ role: 'user', text })
    this.trim()

    const own: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      text,
      at: new Date().toISOString()
    }

    const respuestas = await this.run([])
    this.persistir([own, ...respuestas])
    return respuestas
  }

  /**
   * Vuelca a disco lo nuevo.
   *
   * Saved after each exchange rather than on close: if the app is closed
   * abruptly, a save at the end never runs at all.
   */
  private persistir(nuevos: ChatMessage[]): void {
    // Las acciones pending no se guardan: al reabrir la app ya no se pueden
    // confirm, and a button that does nothing is worse than no button.
    const limpios = nuevos.map(({ pendingAction: _omitido, ...resto }) => resto)
    this.store.save([...this.store.messages(), ...limpios], this.history)
  }

  /** Resolves a pending confirmation and carries on from where it stopped. */
  async confirm(actionId: string, approved: boolean): Promise<ChatMessage[]> {
    const batch = this.pending
    if (!batch || batch.action.id !== actionId) {
      throw new Error('That action is no longer pending.')
    }
    this.pending = null

    const produced: ChatMessage[] = []
    const records: ToolCallRecord[] = []

    if (approved) {
      const call = batch.calls[batch.index]
      const tool = toolByName(call.name)
      if (!tool) throw new Error(`The tool "${call.name}" no longer exists.`)
      await this.runOne(tool, call, batch.args, records)
    } else {
      const call = batch.calls[batch.index]
      this.history.push({
        role: 'tool',
        name: call.name,
        response: { cancelled: true, reason: 'The user did not authorise the action.' }
      })
      records.push({ name: call.name, args: call.args, summary: 'Cancelled by the user', ok: false })
    }

    // The model expects one answer per call it made. The ones queued behind the
    // confirmation are answered as not executed.
    const paused = await this.consume(batch.calls, batch.index + 1, records, produced)
    if (paused) {
      this.persistir(produced)
      return produced
    }

    const finales = await this.run(produced, records)
    this.persistir(finales)
    return finales
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
        // If the model fails, the conversation is left as it was before the
        // call, so retrying does not drag a broken history along.
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
        produced.push(this.assistantMessage(reply.text ?? 'I did not know how to answer that.', records))
        return produced
      }

      // If the model wrote something before using the tools, it is shown.
      if (reply.text) produced.push(this.assistantMessage(reply.text, []))

      const paused = await this.consume(reply.toolCalls, 0, records, produced)
      if (paused) return produced

      records = []
      this.trim()
    }

    produced.push(
      this.assistantMessage(
        'I went round too many times without reaching an answer. Try asking it another way.',
        records
      )
    )
    return produced
  }

  /**
   * Runs the calls from `from` onwards. Returns true if it stopped to wait for
   * the user to confirm something.
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

      // The model gets arguments wrong more often than you would think.
      // Validating here prevents, for instance, an event on an impossible date.
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
        // Some tools have to work something out before they can explain what
        // they will do. If that fails it is treated as an ordinary failure of
        // la herramienta en vez de dejar la conversacion colgada.
        let data = parsed.data
        if (tool.prepare) {
          try {
            data = await tool.prepare(data as never, this.context())
          } catch (err) {
            const message = (err as Error).message
            this.history.push({ role: 'tool', name: call.name, response: { error: message } })
            records.push({ name: call.name, args: call.args, summary: message, ok: false })
            continue
          }
        }

        const described = tool.describe?.(data as never) ?? {
          description: `Ejecutar ${tool.name}`,
          details: []
        }
        const action: PendingAction = {
          id: randomUUID(),
          tool: tool.name,
          args: call.args,
          ...described
        }
        this.pending = { action, calls, index: i, args: data }
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
      // The error goes into the history so the model can explain it to the
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
   * Trims the history without cutting a call/response pair in half: if Gemini
   * receives a functionResponse whose functionCall is gone, it fails.
   */
  private trim(): void {
    if (this.history.length <= MAX_HISTORY) return

    let cut = this.history.length - MAX_HISTORY
    while (cut < this.history.length && this.history[cut].role !== 'user') cut++
    this.history = this.history.slice(cut)
  }
}
