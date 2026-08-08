/**
 * The "brain" contract. Nothing above this interface knows Gemini exists, so
 * changing model — Claude, something local through Ollama — is a matter of
 * writing another implementation and nothing else.
 */

/** A tool declaration in the cut-down OpenAPI shape models understand. */
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

/** A provider error, already turned into something the user can understand. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message)
    this.name = 'LlmError'
  }
}
