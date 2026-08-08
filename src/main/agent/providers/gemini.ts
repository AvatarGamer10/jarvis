import {
  LlmError,
  type CompleteInput,
  type ConversationItem,
  type LLMProvider,
  type LlmReply,
  type ToolCall
} from '../provider'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

// --- The shape of Gemini's payload ------------------------------------------

interface GeminiPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiResponse {
  candidates?: {
    content?: GeminiContent
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; status?: string }
}

/**
 * Las herramientas se declaran en JSON Schema estandar (tipos en minuscula),
 * which is what everything else understands. Gemini uses its own dialect with
 * the types in upper case, so the translation happens here rather than dirtying
 * the tool definitions.
 */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema)
  if (node === null || typeof node !== 'object') return node

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'type' && typeof value === 'string') {
      out[key] = value.toUpperCase()
    } else {
      out[key] = toGeminiSchema(value)
    }
  }
  return out
}

/**
 * Traduce nuestra conversacion neutra al formato de Gemini.
 *
 * Gemini knows only two roles: "user" and "model". Tool results travel as
 * `functionResponse` parts inside a user turn, which is how the official SDK
 * sends them.
 */
function toContents(history: ConversationItem[]): GeminiContent[] {
  const contents: GeminiContent[] = []

  for (const item of history) {
    if (item.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: item.text }] })
      continue
    }

    if (item.role === 'assistant') {
      const parts: GeminiPart[] = []
      if (item.text) parts.push({ text: item.text })
      for (const call of item.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: call.args } })
      }
      if (parts.length > 0) contents.push({ role: 'model', parts })
      continue
    }

    // role === 'tool'
    const previous = contents.at(-1)
    const part: GeminiPart = {
      functionResponse: {
        name: item.name,
        // The response has to be an object: if a tool returns an array
        // or a scalar, Gemini rejects the request.
        response: { result: item.response }
      }
    }

    // Consecutive responses are grouped into the same turn, which is what the
    // model expects when it asks for several tools at once.
    if (previous?.role === 'user' && previous.parts.every((p) => p.functionResponse)) {
      previous.parts.push(part)
    } else {
      contents.push({ role: 'user', parts: [part] })
    }
  }

  return contents
}

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini'

  constructor(private readonly getConfig: () => { apiKey: string; model: string }) {}

  async complete(input: CompleteInput): Promise<LlmReply> {
    const { apiKey, model } = this.getConfig()
    if (!apiKey) {
      throw new LlmError('No Gemini API key yet. Add one in Settings.', false)
    }

    const body = {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: toContents(input.history),
      ...(input.tools.length > 0
        ? {
            tools: [
              {
                functionDeclarations: input.tools.map((tool) => ({
                  ...tool,
                  parameters: toGeminiSchema(tool.parameters)
                }))
              }
            ]
          }
        : {}),
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    }

    let res: Response
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body)
      })
    } catch (err) {
      throw new LlmError(`Cannot reach Gemini: ${(err as Error).message}`, true)
    }

    const data = (await res.json().catch(() => ({}))) as GeminiResponse

    if (!res.ok) {
      throw new LlmError(this.explain(res.status, data, model), res.status === 429 || res.status >= 500)
    }

    if (data.promptFeedback?.blockReason) {
      throw new LlmError(
        `Gemini blocked the request (${data.promptFeedback.blockReason}).`,
        false
      )
    }

    const parts = data.candidates?.[0]?.content?.parts ?? []
    const toolCalls: ToolCall[] = []
    let text = ''

    for (const part of parts) {
      if (part.text) text += part.text
      if (part.functionCall) {
        toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} })
      }
    }

    const finish = data.candidates?.[0]?.finishReason
    if (finish === 'MAX_TOKENS' && !text && toolCalls.length === 0) {
      throw new LlmError('The reply was cut off by length. Try asking something more specific.', false)
    }

    return { text: text.trim() || null, toolCalls }
  }

  private explain(status: number, data: GeminiResponse, model: string): string {
    const raw = data.error?.message ?? `HTTP ${status}`

    if (status === 400 && /API key not valid/i.test(raw)) {
      return 'That Gemini API key is not valid. Check it in Settings.'
    }
    if (status === 404) {
      return `The model “${model}” does not exist or is unavailable for this key. Check its name in AI Studio.`
    }
    if (status === 429) {
      return 'The Gemini quota is exhausted for now. Wait a little or switch to a Flash model.'
    }
    if (status >= 500) {
      return 'Gemini is having trouble right now. Try again in a minute.'
    }
    return `Gemini returned an error: ${raw}`
  }
}
