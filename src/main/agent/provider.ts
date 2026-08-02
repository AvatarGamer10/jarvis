/**
 * Contrato del "cerebro". Todo lo que hay por encima de esta interfaz no sabe
 * que existe Gemini, asi que cambiar de modelo (Claude, un modelo local con
 * Ollama...) es escribir otra implementacion y nada mas.
 */

/** Declaracion de herramienta en formato OpenAPI reducido, que es lo que entienden los modelos. */
export interface FunctionDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

/** Un turno de la conversacion, en forma neutra respecto al proveedor. */
export type ConversationItem =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; name: string; response: unknown }

export interface LlmReply {
  text: string | null
  toolCalls: ToolCall[]
}

export interface CompleteInput {
  system: string
  history: ConversationItem[]
  tools: FunctionDeclaration[]
}

export interface LLMProvider {
  readonly id: string
  complete(input: CompleteInput): Promise<LlmReply>
}

/** Error del proveedor ya traducido a algo que el usuario pueda entender. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message)
    this.name = 'LlmError'
  }
}
