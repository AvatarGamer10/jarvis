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
 * Advantages over a cloud API: free, no quota, no account, and none of the
 * user's data leaves the machine. In exchange, the models that fit on a laptop
 * get tool choices wrong more often, which is why the loop validates
 * everything they return before running anything.
 *
 * It speaks the OpenAI dialect, which is what /api/chat uses.
 */

interface OllamaToolCall {
  function: {
    name: string
    /** Ollama lo manda como objeto; algunos modelos lo mandan como text JSON. */
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

    // A tool result. Ollama expects the content as text.
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
      throw new LlmError('No Ollama model is selected. Choose one in Settings.', false)
    }

    const body = {
      model,
      messages: toMessages(input.system, input.history),
      // No streaming: the loop needs the whole reply before it can tell si
      // el model ha pedido herramientas.
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
      // By far the most common failure: Ollama is not running.
      throw new LlmError(
        `Cannot reach Ollama at ${host}. Check that it is running and that the address in Settings is correct.`,
        true
      )
    }

    const text = await res.text()
    let data: OllamaResponse
    try {
      data = text ? (JSON.parse(text) as OllamaResponse) : {}
    } catch {
      throw new LlmError(`Ollama returned an unreadable response: ${text.slice(0, 200)}`, false)
    }

    if (!res.ok) {
      const message = data.error ?? `HTTP ${res.status}`
      if (/not found|no such model|pull/i.test(message)) {
        throw new LlmError(
          `The model “${model}” is not installed. Download it in Settings or run: ollama pull ${model}`,
          false
        )
      }
      throw new LlmError(`Ollama returned an error: ${message}`, res.status >= 500)
    }

    const message = data.message
    const toolCalls: ToolCall[] = []

    for (const call of message?.tool_calls ?? []) {
      let args: Record<string, unknown> = {}
      if (typeof call.function.arguments === 'string') {
        // Some small models return the arguments as JSON text.
        // If it arrives broken it is left empty and zod rejects it clearly.
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

  /** Lists the pulled models, so one can be chosen in Settings. */
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
