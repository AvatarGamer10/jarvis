import type { ChatMessage, ChatSummary } from '@shared/types'
import { JsonStore } from '../store/json-store'
import type { ConversationItem } from './provider'

interface ChatData {
  /** What the user sees on screen. */
  messages: ChatMessage[]
  /** What the model sees. Not the same thing: the tool results go in here too,
      and on screen those are reduced to a single line. */
  context: ConversationItem[]
}

/** A finished conversation, kept so it can be returned to. */
interface Archived extends ChatData {
  id: string
  /** ISO of the last message. This is what the list is ordered by. */
  at: string
}

interface History {
  conversations: Archived[]
}

/**
 * How many messages are kept on screen. Beyond that nobody reads them, and the
 * file grows without limit.
 */
const MAX_MESSAGES = 200

/**
 * How many conversations are archived.
 *
 * This is a homework assistant, not a document manager. Fifty covers "what we
 * talked about last week" with room to spare, which is the only reason anybody
 * opens the history.
 */
const MAX_CONVERSATIONS = 50

/**
 * Keeps conversations across restarts.
 *
 * This used to live only in memory: closing the app made everything said
 * disappear, and the assistant could remember nothing from one day to the next.
 *
 * Two things are stored separately on purpose. The on-screen messages and the
 * model's context diverge: on screen a tool call is one summary line, while the
 * model needs the full result to follow the thread.
 *
 * The conversation in progress lives in its own file and the earlier ones in
 * another. They could share, but the active one is rewritten on every message
 * and the history almost never is — separating them avoids dumping fifty
 * conversations to disk every time somebody asks what the time is.
 */
export class ChatStore {
  private readonly store: JsonStore<ChatData>
  private readonly archived: JsonStore<History>

  constructor() {
    this.store = new JsonStore<ChatData>('chat.json', { messages: [], context: [] })
    this.archived = new JsonStore<History>('chat-history.json', { conversations: [] })
  }

  messages(): ChatMessage[] {
    return this.store.get().messages
  }

  context(): ConversationItem[] {
    return this.store.get().context
  }

  save(messages: ChatMessage[], context: ConversationItem[]): void {
    this.store.set({
      messages: messages.slice(-MAX_MESSAGES),
      context
    })
  }

  /**
   * Files the current conversation into the history and clears the table.
   *
   * An empty conversation is not archived: pressing "new chat" twice cannot
   * fill the history with conversations that have nothing in them.
   */
  archiveCurrent(): void {
    const current = this.store.get()
    if (current.messages.length > 0) {
      const conversations = [
        {
          id: crypto.randomUUID(),
          at: current.messages.at(-1)?.at ?? new Date().toISOString(),
          messages: current.messages,
          context: current.context
        },
        ...this.archived.get().conversations
      ].slice(0, MAX_CONVERSATIONS)

      this.archived.set({ conversations })
    }

    this.store.set({ messages: [], context: [] })
  }

  /** Just enough to paint the list: without the messages, which are heavy. */
  history(): ChatSummary[] {
    return this.archived.get().conversations.map((conversation) => ({
      id: conversation.id,
      at: conversation.at,
      messages: conversation.messages.length,
      title: titleOf(conversation.messages)
    }))
  }

  /**
   * Returns to an earlier conversation.
   *
   * The current one is archived first, so moving between conversations never
   * loses anything — which is the only way the list is any use.
   */
  open(id: string): ChatMessage[] {
    const saved = this.archived.get().conversations.find((c) => c.id === id)
    if (!saved) return this.messages()

    this.archiveCurrent()
    this.archived.set({
      conversations: this.archived.get().conversations.filter((c) => c.id !== id)
    })
    this.store.set({ messages: saved.messages, context: saved.context })
    return saved.messages
  }

  remove(id: string): void {
    this.archived.set({
      conversations: this.archived.get().conversations.filter((c) => c.id !== id)
    })
  }

  /** Clears the current conversation without archiving it. */
  clear(): void {
    this.store.set({ messages: [], context: [] })
  }
}

/**
 * What a conversation is called in the list.
 *
 * The first thing that was asked, trimmed. Asking the model for a title would
 * cost a call per conversation for something read out of the corner of the eye,
 * and the original question almost always describes it better anyway.
 */
function titleOf(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user' && m.text.trim())
  if (!first) return 'Untitled'
  const text = first.text.trim().replace(/\s+/g, ' ')
  return text.length > 58 ? `${text.slice(0, 57)}…` : text
}
