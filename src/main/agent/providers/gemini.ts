import {
  LlmError,
  type CompleteInput,
  type ConversationItem,
  type LLMProvider,
  type LlmReply,
  type ToolCall
} from '../provider'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

// --- Forma del payload de Gemini ------------------------------------------

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
 * que es lo que entiende todo el mundo. Gemini usa su propio dialecto con los
 * tipos en mayuscula, asi que la traduccion se hace aqui y no ensucia las
 * definiciones de las herramientas.
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
 * Gemini solo conoce dos roles: "user" y "model". Los resultados de las
 * herramientas viajan como partes `functionResponse` dentro de un turno de
 * usuario, que es como el propio SDK oficial los envia.
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
        // La respuesta debe ser un objeto: si la herramienta devuelve un array
        // o un escalar, Gemini rechaza la peticion.
        response: { result: item.response }
      }
    }

    // Varias respuestas seguidas se agrupan en el mismo turno, que es lo que
    // espera el modelo cuando pide varias herramientas a la vez.
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
      throw new LlmError('Falta la API key de Gemini. Configurala en Ajustes.', false)
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
      throw new LlmError(`No hay conexion con Gemini: ${(err as Error).message}`, true)
    }

    const data = (await res.json().catch(() => ({}))) as GeminiResponse

    if (!res.ok) {
      throw new LlmError(this.explain(res.status, data, model), res.status === 429 || res.status >= 500)
    }

    if (data.promptFeedback?.blockReason) {
      throw new LlmError(
        `Gemini ha bloqueado la peticion (${data.promptFeedback.blockReason}).`,
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
      throw new LlmError('La respuesta se corto por longitud. Prueba a preguntar algo mas concreto.', false)
    }

    return { text: text.trim() || null, toolCalls }
  }

  private explain(status: number, data: GeminiResponse, model: string): string {
    const raw = data.error?.message ?? `HTTP ${status}`

    if (status === 400 && /API key not valid/i.test(raw)) {
      return 'La API key de Gemini no es valida. Revisala en Ajustes.'
    }
    if (status === 404) {
      return `El modelo "${model}" no existe o no esta disponible para tu clave. Comprueba el nombre en AI Studio.`
    }
    if (status === 429) {
      return 'Has agotado la cuota gratuita de Gemini por ahora. Espera un poco o cambia a un modelo Flash.'
    }
    if (status >= 500) {
      return 'Gemini esta teniendo problemas ahora mismo. Intentalo en un minuto.'
    }
    return `Gemini devolvio un error: ${raw}`
  }
}
