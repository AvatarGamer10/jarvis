import {
  LlmError,
  type CompleteInput,
  type ConversationItem,
  type LLMProvider,
  type LlmReply,
  type ToolCall
} from '../provider'

/**
 * Proveedor local contra Ollama (https://ollama.com).
 *
 * Ventajas frente a una API en la nube: es gratis, no tiene cuota, no necesita
 * cuenta y ningun dato del usuario sale del equipo. A cambio, los modelos que
 * caben en un portatil se equivocan mas eligiendo herramientas, por eso el
 * bucle valida todo lo que devuelven antes de ejecutar nada.
 *
 * Habla el dialecto de OpenAI, que es el que usa /api/chat.
 */

interface OllamaToolCall {
  function: {
    name: string
    /** Ollama lo manda como objeto; algunos modelos lo mandan como texto JSON. */
    arguments: Record<string, unknown> | string
  }
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: OllamaToolCall[]
}

interface OllamaResponse {
  message?: OllamaMessage
  error?: string
  done?: boolean
}

function toMessages(system: string, history: ConversationItem[]): OllamaMessage[] {
  const messages: OllamaMessage[] = [{ role: 'system', content: system }]

  for (const item of history) {
    if (item.role === 'user') {
      messages.push({ role: 'user', content: item.text })
      continue
    }

    if (item.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: item.text ?? '',
        ...(item.toolCalls && item.toolCalls.length > 0
          ? {
              tool_calls: item.toolCalls.map((call) => ({
                function: { name: call.name, arguments: call.args }
              }))
            }
          : {})
      })
      continue
    }

    // El resultado de una herramienta. Ollama espera el contenido como texto.
    messages.push({
      role: 'tool',
      content: JSON.stringify({ result: item.response })
    })
  }

  return messages
}

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama'

  constructor(private readonly getConfig: () => { host: string; model: string }) {}

  async complete(input: CompleteInput): Promise<LlmReply> {
    const { host, model } = this.getConfig()
    if (!model) {
      throw new LlmError('No has elegido ningun modelo de Ollama en Ajustes.', false)
    }

    const body = {
      model,
      messages: toMessages(input.system, input.history),
      // Sin streaming: el bucle necesita la respuesta completa para saber si
      // el modelo ha pedido herramientas.
      stream: false,
      ...(input.tools.length > 0
        ? {
            tools: input.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
              }
            }))
          }
        : {}),
      options: { temperature: 0.2 }
    }

    let res: Response
    try {
      res = await fetch(new URL('/api/chat', host).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    } catch {
      // El fallo mas comun con diferencia: Ollama no esta arrancado.
      throw new LlmError(
        `No se puede conectar con Ollama en ${host}. Comprueba que esta abierto ` +
          `(deberia responder en el navegador) y que la direccion de Ajustes es correcta.`,
        true
      )
    }

    const text = await res.text()
    let data: OllamaResponse
    try {
      data = text ? (JSON.parse(text) as OllamaResponse) : {}
    } catch {
      throw new LlmError(`Ollama devolvio una respuesta que no se entiende: ${text.slice(0, 200)}`, false)
    }

    if (!res.ok) {
      const message = data.error ?? `HTTP ${res.status}`
      if (/not found|no such model|pull/i.test(message)) {
        throw new LlmError(
          `El modelo "${model}" no esta descargado. Abre una terminal y ejecuta: ollama pull ${model}`,
          false
        )
      }
      throw new LlmError(`Ollama devolvio un error: ${message}`, res.status >= 500)
    }

    const message = data.message
    const toolCalls: ToolCall[] = []

    for (const call of message?.tool_calls ?? []) {
      let args: Record<string, unknown> = {}
      if (typeof call.function.arguments === 'string') {
        // Algunos modelos pequenos devuelven los argumentos como texto JSON.
        // Si viene roto, se deja vacio y zod lo rechazara con un mensaje claro.
        try {
          args = JSON.parse(call.function.arguments) as Record<string, unknown>
        } catch {
          args = {}
        }
      } else {
        args = call.function.arguments ?? {}
      }
      toolCalls.push({ name: call.function.name, args })
    }

    return { text: message?.content?.trim() || null, toolCalls }
  }

  /** Lista los modelos descargados, para poder elegir en Ajustes. */
  async listModels(): Promise<string[]> {
    const { host } = this.getConfig()
    try {
      const res = await fetch(new URL('/api/tags', host).toString())
      if (!res.ok) return []
      const data = (await res.json()) as { models?: { name: string }[] }
      return (data.models ?? []).map((m) => m.name)
    } catch {
      return []
    }
  }
}
