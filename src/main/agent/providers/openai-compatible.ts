import type { LlmProviderId } from '@shared/types'
import {
  LlmError,
  type CompleteInput,
  type ConversationItem,
  type LLMProvider,
  type LlmReply,
  type ToolCall
} from '../provider'

/**
 * Every service that speaks the OpenAI chat-completions dialect.
 *
 * OpenRouter, OpenAI, Groq and anything self-hosted behind an OpenAI-shaped
 * endpoint are, as far as this file is concerned, the same API at four
 * addresses. What differs is the base URL, the header the key goes in, and
 * what the error codes mean — so that is all a brand is, and adding another
 * one is a dozen lines rather than a new client.
 *
 * Gemini and Ollama are still separate, because they genuinely are: Gemini has
 * its own request shape and Ollama returns tool arguments as objects rather
 * than as JSON strings.
 */

export interface Brand {
  id: LlmProviderId
  /** How it is referred to in error messages, so they read like English. */
  name: string
  baseUrl: string
  /** Where to list models. Empty when the service has no such endpoint. */
  modelsUrl: string
  /** Where the user goes to get a key. Shown in Settings. */
  keysUrl: string
  /** A sensible starting model, offered as the placeholder. */
  defaultModel: string
  headers?: Record<string, string>
  /** True when the key is optional — a local server usually wants none. */
  keyOptional?: boolean
}

export const BRANDS: Record<string, Brand> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    keysUrl: 'https://openrouter.ai/keys',
    defaultModel: 'anthropic/claude-3.5-haiku',
    // OpenRouter attributes traffic with these two. They are optional, and
    // neither carries anything about the user.
    headers: {
      'HTTP-Referer': 'https://github.com/AvatarGamer10/jarvis',
      'X-Title': 'Vilo'
    }
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelsUrl: 'https://api.openai.com/v1/models',
    keysUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4.1-mini'
  },
  /**
   * Anthropic, through the OpenAI-shaped endpoint they publish alongside their
   * own. It is not their native API — that one has a different request shape
   * entirely — but it speaks this dialect faithfully enough to reuse this
   * client, which is worth more than the handful of features it does not
   * expose.
   */
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-3-5-haiku-latest'
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    keysUrl: 'https://console.groq.com/keys',
    defaultModel: 'llama-3.3-70b-versatile'
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    keysUrl: 'https://console.mistral.ai/api-keys',
    defaultModel: 'mistral-small-latest'
  },
  custom: {
    id: 'custom',
    name: 'the server you configured',
    // Filled in from settings at call time.
    baseUrl: '',
    modelsUrl: '',
    keysUrl: '',
    defaultModel: '',
    keyOptional: true
  }
}

interface OpenAiToolCall {
  id?: string
  type?: string
  function: {
    name: string
    /** Always a JSON string in this dialect, unlike Ollama's object. */
    arguments: string
  }
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAiToolCall[]
  tool_call_id?: string
}

interface OpenAiResponse {
  choices?: {
    message?: OpenAiMessage
    finish_reason?: string
  }[]
  error?: { message?: string; code?: number | string }
}

/**
 * Translate our conversation into theirs.
 *
 * The fiddly part is tool results: this dialect requires every `tool` message
 * to carry the `tool_call_id` of the call it answers, and our neutral format
 * does not record ids — it just knows which tool replied. So ids are minted
 * here, in order, and the tool results are matched back to the calls of the
 * assistant turn immediately before them. That is the same order the agent
 * loop produces them in, so the pairing is exact.
 */
function toMessages(system: string, history: ConversationItem[]): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [{ role: 'system', content: system }]

  /** Call ids issued by the last assistant turn, waiting for their results. */
  let pending: { id: string; name: string }[] = []
  let counter = 0

  for (const item of history) {
    if (item.role === 'user') {
      messages.push({ role: 'user', content: item.text })
      pending = []
      continue
    }

    if (item.role === 'assistant') {
      const calls = item.toolCalls ?? []
      pending = calls.map((call) => ({ id: `call_${counter++}`, name: call.name }))

      messages.push({
        role: 'assistant',
        content: item.text ?? '',
        ...(calls.length > 0
          ? {
              tool_calls: calls.map((call, index) => ({
                id: pending[index].id,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) }
              }))
            }
          : {})
      })
      continue
    }

    // A tool result. Matched to its call by name first — a model can invoke
    // two different tools in one turn and the results need not come back in
    // the order they were asked for.
    const slot = pending.findIndex((call) => call.name === item.name)
    const matched = slot >= 0 ? pending.splice(slot, 1)[0] : null

    messages.push({
      role: 'tool',
      tool_call_id: matched?.id ?? `call_${counter++}`,
      content: JSON.stringify({ result: item.response })
    })
  }

  return messages
}

export interface CompatConfig {
  apiKey: string
  model: string
  /** Only used by the custom brand; ignored elsewhere. */
  baseUrl?: string
}

export class OpenAiCompatibleProvider implements LLMProvider {
  readonly id: string

  constructor(
    private readonly brand: Brand,
    private readonly getConfig: () => CompatConfig
  ) {
    this.id = brand.id
  }

  /** The base the current settings point at. Only `custom` can move. */
  private base(config: CompatConfig): string {
    const raw = this.brand.id === 'custom' ? (config.baseUrl ?? '') : this.brand.baseUrl
    return raw.replace(/\/+$/, '')
  }

  async complete(input: CompleteInput): Promise<LlmReply> {
    const config = this.getConfig()
    const { apiKey, model } = config
    const base = this.base(config)
    const name = this.brand.name

    if (!base) {
      throw new LlmError('No server address yet. Add one in Settings.', false)
    }
    if (!apiKey && !this.brand.keyOptional) {
      throw new LlmError(`No ${name} API key yet. Add one in Settings.`, false)
    }
    if (!model) {
      throw new LlmError(`No ${name} model chosen. Pick one in Settings.`, false)
    }

    const body = {
      model,
      messages: toMessages(input.system, input.history),
      // No streaming: the agent loop needs the whole reply before it can tell
      // whether tools were requested.
      stream: false,
      temperature: 0.2,
      max_tokens: 2048,
      ...(input.tools.length > 0
        ? {
            tools: input.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
              }
            })),
            tool_choice: 'auto'
          }
        : {})
    }

    let res: Response
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...(this.brand.headers ?? {})
        },
        body: JSON.stringify(body)
      })
    } catch (err) {
      throw new LlmError(`Cannot reach ${name}: ${(err as Error).message}`, true)
    }

    const raw = await res.text()
    let data: OpenAiResponse
    try {
      data = raw ? (JSON.parse(raw) as OpenAiResponse) : {}
    } catch {
      throw new LlmError(
        `${name} sent back something unreadable: ${raw.slice(0, 200)}`,
        res.status >= 500
      )
    }

    if (!res.ok) {
      throw new LlmError(
        this.explain(res.status, data, model),
        res.status === 429 || res.status >= 500
      )
    }

    const choice = data.choices?.[0]
    const message = choice?.message

    // A 200 with no choices means the upstream provider dropped it. Almost
    // always transient, so it is worth another go.
    if (!message) {
      throw new LlmError(`${name} returned an empty response. Try again.`, true)
    }

    const toolCalls: ToolCall[] = []
    for (const call of message.tool_calls ?? []) {
      let args: Record<string, unknown> = {}
      try {
        args = call.function.arguments
          ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
          : {}
      } catch {
        // Smaller models sometimes emit arguments that are not valid JSON.
        // Left empty so the loop's schema check rejects it with a clear
        // message instead of throwing here.
        args = {}
      }
      toolCalls.push({ name: call.function.name, args })
    }

    if (choice?.finish_reason === 'length' && !message.content && toolCalls.length === 0) {
      throw new LlmError(
        'The reply was cut off by length. Try asking something more specific.',
        false
      )
    }

    return { text: message.content?.trim() || null, toolCalls }
  }

  private explain(status: number, data: OpenAiResponse, model: string): string {
    const name = this.brand.name
    const raw = data.error?.message ?? `HTTP ${status}`

    if (status === 401 || status === 403) {
      return `That ${name} API key was rejected. Check it in Settings.`
    }
    if (status === 402) {
      return `Your ${name} credit has run out. Top up, or switch to a free model.`
    }
    if (status === 404) {
      return `${name} has no model called "${model}". Check the exact id.`
    }
    if (status === 429) {
      return `${name} is rate limiting you. Wait a moment, or pick a model with more headroom.`
    }
    if (status >= 500) {
      return `${name} is having trouble right now. Try again in a minute.`
    }
    return `${name} returned an error: ${raw}`
  }

  /**
   * Models this key can actually use.
   *
   * OpenRouter says which of them support tool calling, so on OpenRouter the
   * list is filtered to those — Vilo's entire job is running tools, and a model
   * that cannot would look broken rather than limited. Nobody else publishes
   * that flag, so elsewhere the whole list comes back and the wrong choice
   * surfaces as a clear error on the first message instead.
   */
  async listModels(): Promise<{ id: string; name: string; free: boolean }[]> {
    const config = this.getConfig()
    const url =
      this.brand.id === 'custom' ? `${this.base(config)}/models` : this.brand.modelsUrl
    if (!url || url === '/models') return []

    try {
      const res = await fetch(url, {
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}
      })
      if (!res.ok) return []

      const data = (await res.json()) as {
        data?: {
          id: string
          name?: string
          supported_parameters?: string[]
          pricing?: { prompt?: string; completion?: string }
        }[]
      }

      return (data.data ?? [])
        .filter(
          (model) => this.brand.id !== 'openrouter' || model.supported_parameters?.includes('tools')
        )
        .map((model) => ({
          id: model.id,
          name: model.name ?? model.id,
          free: Number(model.pricing?.prompt ?? '1') === 0
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    } catch {
      return []
    }
  }

  /**
   * A single cheap request that proves the whole path works.
   *
   * Listing models only proves the key is valid. This proves the key, the
   * model id, the network and the account's credit all line up, which is what
   * "working" has to mean on the settings screen — anything less and the first
   * real question is where you find out.
   */
  async check(): Promise<{ ok: boolean; detail: string }> {
    const config = this.getConfig()
    if (!config.apiKey && !this.brand.keyOptional) return { ok: false, detail: 'No API key yet' }
    if (!config.model) return { ok: false, detail: 'No model chosen' }

    try {
      await this.complete({
        system: 'Reply with the single word: ready.',
        history: [{ role: 'user', text: 'ready?' }],
        tools: []
      })
      return { ok: true, detail: `${config.model} answered` }
    } catch (err) {
      return { ok: false, detail: (err as Error).message }
    }
  }
}
