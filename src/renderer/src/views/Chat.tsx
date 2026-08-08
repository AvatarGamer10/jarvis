import {
  AudioLines,
  Clock,
  Cpu,
  Paperclip,
  RotateCcw,
  ShieldQuestion,
  SquarePen,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Attachment, ChatMessage, ChatSummary } from '@shared/types'
import Logo from '../components/Logo'
import Markdown from '../components/Markdown'
import TopbarActions from '../components/TopbarActions'
import { Reveal } from '../components/anim'
import {
  Actions,
  AttachmentChip,
  ComposerButton,
  Conversation,
  CopyAction,
  Message,
  PromptInput,
  Thinking,
  Tools
} from '../components/chat'
import { Empty, StateNotice } from '../components/ui'
import { navigateTo } from '../lib/app-events'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'
import { shortDate } from '../lib/dates'

const SUGGESTIONS = [
  'What do I have this week?',
  'What homework is still open?',
  'Block two hours of study tomorrow afternoon',
  'What did I miss while I was away?'
]

/**
 * The chat.
 *
 * Everything on this screen answers one question: what did Vilo do, and can I
 * still see it? Answers are set as prose at a readable measure, what you asked
 * sits in a quiet pill above them, and the tools that ran are folded into a
 * single line you can open. Nothing scrolls away on its own and nothing
 * disappears when the next thing arrives.
 */
export default function Chat(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [calls, setCalls] = useState(0)
  const [loading, setLoading] = useState(true)
  /** Shown on the composer toolbar, the way every other chat app does it. */
  const [model, setModel] = useState<string | null>(null)
  const [attached, setAttached] = useState<Attachment[]>([])
  const [history, setHistory] = useState<ChatSummary[] | null>(null)

  /** The last thing sent, so a failed turn can be retried without retyping. */
  const lastSent = useRef('')

  const refreshUsage = async (): Promise<void> => {
    const result = await window.vilo.agent.usage()
    if (result.ok) setCalls(result.data.callsToday)
  }

  useEffect(() => {
    void refreshUsage()

    void window.vilo.settings.get().then((result) => {
      if (!result.ok) return
      const s = result.data
      const chosen = {
        openrouter: s.openrouterModel,
        openai: s.openaiModel,
        anthropic: s.anthropicModel,
        groq: s.groqModel,
        mistral: s.mistralModel,
        gemini: s.geminiModel,
        ollama: s.ollamaModel,
        custom: s.customModel
      }[s.llmProvider]
      // Only the last segment: "anthropic/claude-3.5-haiku" is too long for a
      // toolbar, and the part after the slash is the part that identifies it.
      setModel(chosen ? chosen.split('/').at(-1)! : null)
    })

    // The conversation survives restarts, so it is restored on open.
    void window.vilo.agent.history().then((result) => {
      if (result.ok && result.data.length > 0) setMessages(result.data)
      if (!result.ok) setError(result.error)
      setLoading(false)
    })
  }, [])

  const refreshHistory = async (): Promise<void> => {
    const result = await window.vilo.agent.conversations()
    if (result.ok) setHistory(result.data)
  }

  /**
   * Attach a file.
   *
   * Its text is prepended to the message rather than sent as a separate thing,
   * because the model has one input and that is where anything it should read
   * has to end up. Reading it here also means what gets sent is visible: the
   * chip says which file and how big, and it can be taken off again before it
   * goes anywhere.
   */
  const attach = async (): Promise<void> => {
    const result = await window.vilo.dialog.attachFile()
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    if (result.data) setAttached((current) => [...current, result.data!])
  }

  const send = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if ((!trimmed && attached.length === 0) || busy) return

    const body = attached.length
      ? `${attached
          .map((file) => `--- ${file.name} ---\n${file.text}`)
          .join('\n\n')}\n\n${trimmed}`
      : trimmed

    lastSent.current = body
    setAttached([])
    setInput('')
    setError(null)
    setBusy(true)
    setMessages((previous) => [
      // A new message cancels any pending confirmation in the main process, so
      // its buttons come off the screen too. Leaving them would give you a
      // button that can only produce an error.
      ...previous.map((m) => (m.pendingAction ? { ...m, pendingAction: undefined } : m)),
      {
        id: crypto.randomUUID(),
        role: 'user',
        // What is shown is what you typed plus the names of what came with it —
        // pasting a whole file into the transcript would bury the conversation.
        text: attached.length
          ? `${trimmed}${trimmed ? '\n\n' : ''}📎 ${attached.map((f) => f.name).join(', ')}`
          : trimmed,
        at: new Date().toISOString()
      }
    ])

    const result = await window.vilo.agent.send(body)
    if (result.ok) setMessages((previous) => [...previous, ...result.data])
    else setError(result.error)

    setBusy(false)
    void refreshUsage()
  }

  const resolve = async (actionId: string, approved: boolean): Promise<void> => {
    sound.play(approved ? 'confirm' : 'cancel')
    setBusy(true)
    setError(null)

    // The card goes as soon as it is decided, so it cannot be pressed twice.
    setMessages((previous) =>
      previous.map((m) =>
        m.pendingAction?.id === actionId ? { ...m, pendingAction: undefined } : m
      )
    )

    const result = await window.vilo.agent.confirm(actionId, approved)
    if (result.ok) setMessages((previous) => [...previous, ...result.data])
    else setError(result.error)

    setBusy(false)
    void refreshUsage()
  }

  /** Files the conversation away and starts a fresh one. Nothing is lost. */
  const newChat = async (): Promise<void> => {
    await window.vilo.agent.newConversation()
    setMessages([])
    setError(null)
    setHistory(null)
  }

  const open = async (id: string): Promise<void> => {
    const result = await window.vilo.agent.openConversation(id)
    if (result.ok) {
      setMessages(result.data)
      setError(null)
      setHistory(null)
    }
  }

  const empty = messages.length === 0 && !busy && !loading && !error

  return (
    <div className="chat">
      {/* In the window header, beside the page title — not inside the
          conversation. Floating them over the transcript meant the messages
          had to leave a gap for them, which is what threw the layout out.
          "New chat" rather than "Clear", because nothing is destroyed: the old
          one goes into the history next to it. */}
      <TopbarActions>
        <button
          className="chat-head-btn"
          onClick={() => (history ? setHistory(null) : void refreshHistory())}
          aria-expanded={history !== null}
        >
          <Clock />
          History
        </button>
        {messages.length > 0 && (
          <button className="chat-head-btn" onClick={newChat} disabled={busy}>
            <SquarePen />
            New chat
          </button>
        )}
      </TopbarActions>

      {history !== null && (
        <>
          {/* Click anywhere else to put it away. A panel with only an X is a
              panel people leave open by accident. */}
          <button
            className="chat-history-scrim"
            aria-label="Close history"
            onClick={() => setHistory(null)}
          />
          <div className="chat-history">
            <header>
              <strong>Earlier conversations</strong>
              <button className="btn ghost sm icon" onClick={() => setHistory(null)}>
                <X />
              </button>
            </header>

            {history.length === 0 ? (
              <Empty
                icon={<Clock />}
                title="Nothing yet"
                hint="Conversations are filed here when you start a new one."
              />
            ) : (
              <div className="chat-history-list scroll">
                {history.map((item) => (
                  <div key={item.id} className="chat-history-row">
                    <button className="grow" onClick={() => void open(item.id)}>
                      <span className="truncate">{item.title}</span>
                      <span className="meta">
                        {shortDate(item.at)} · {item.messages} message
                        {item.messages === 1 ? '' : 's'}
                      </span>
                    </button>
                    <button
                      className="btn ghost sm icon"
                      aria-label="Delete"
                      onClick={() =>
                        void window.vilo.agent
                          .deleteConversation(item.id)
                          .then(() => void refreshHistory())
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Conversation>
        {loading && messages.length === 0 && (
          <div className="col" style={{ gap: 'var(--s-4)', paddingTop: 'var(--s-8)' }}>
            <div className="skeleton" style={{ width: '68%', height: 15 }} />
            <div className="skeleton" style={{ width: '46%', height: 15 }} />
          </div>
        )}

        {empty && <Opening onPick={(text) => void send(text)} />}

        {messages.map((message) =>
          message.role === 'user' ? (
            <Message key={message.id} role="user">
              <div className="msg-bubble selectable">{message.text}</div>
            </Message>
          ) : (
            <Message key={message.id} role="assistant">
              <span className="msg-mark" aria-hidden="true">
                <Logo size={15} opacity={0.9} />
              </span>

              {message.toolCalls && <Tools calls={message.toolCalls} />}

              {message.text && <Markdown text={message.text} className="selectable" />}

              {message.pendingAction && (
                <div className="confirm">
                  <div className="confirm-head">
                    <ShieldQuestion />
                    {message.pendingAction.description}
                  </div>

                  {message.pendingAction.details.length > 0 && (
                    <div className="confirm-details">
                      {message.pendingAction.details.map((detail) => (
                        <span key={detail} className="truncate">
                          {detail}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="confirm-foot">
                    <button
                      className="btn primary sm"
                      disabled={busy}
                      onClick={() => void resolve(message.pendingAction!.id, true)}
                    >
                      Do it
                    </button>
                    <button
                      className="btn sm"
                      disabled={busy}
                      onClick={() => void resolve(message.pendingAction!.id, false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {message.text && !message.pendingAction && (
                <Actions>
                  <CopyAction text={message.text} />
                </Actions>
              )}
            </Message>
          )
        )}

        {busy && (
          <Message role="assistant">
            <span className="msg-mark" aria-hidden="true">
              <Logo size={15} opacity={0.9} />
            </span>
            <Thinking />
          </Message>
        )}

        {error && (
          <StateNotice
            compact
            tone="error"
            title="Vilo could not finish that"
            hint={error}
            action={
              <div className="row">
                {lastSent.current && (
                  <button className="btn sm" onClick={() => void send(lastSent.current)}>
                    <RotateCcw />
                    Try again
                  </button>
                )}
                <button className="btn ghost sm" onClick={() => navigateTo('settings')}>
                  Check settings
                </button>
              </div>
            }
          />
        )}
      </Conversation>

      <PromptInput
        value={input}
        onChange={setInput}
        onSubmit={() => void send(input)}
        disabled={busy}
        attachments={
          attached.length > 0 ? (
            <div className="attachments">
              {attached.map((file, index) => (
                <AttachmentChip
                  key={`${file.name}-${index}`}
                  name={file.name}
                  bytes={file.bytes}
                  onRemove={() => setAttached((c) => c.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          ) : null
        }
        toolbar={
          <>
            <ComposerButton onClick={() => void attach()} title="Attach a file">
              <Paperclip />
            </ComposerButton>

            <ComposerButton onClick={() => navigateTo('settings')} title="Change the model">
              <Cpu />
              {model ?? 'No model'}
            </ComposerButton>

            <ComposerButton onClick={() => navigateTo('voice')} title="Say it instead">
              <AudioLines />
            </ComposerButton>

            {calls > 0 && (
              <span className="composer-usage">
                {calls} call{calls === 1 ? '' : 's'} today
              </span>
            )}
          </>
        }
      />
    </div>
  )
}

/**
 * What an empty chat says.
 *
 * Not an empty state with a shrug icon — an offer. The four suggestions are
 * the four things people actually open this for, and clicking one is faster
 * than composing the same sentence badly.
 */
function Opening({ onPick }: { onPick: (text: string) => void }): JSX.Element {
  return (
    <div className="chat-opening">
      {/* No icon above the heading. A sparkle over a sentence about AI is the
          single most recognisable piece of generated design there is, and this
          screen does not need a picture to explain a question. */}
      <Reveal delay={0.04}>
        <h2 className="display">What can I get out of the way?</h2>
      </Reveal>

      <Reveal delay={0.12}>
        <p>
          I can read your calendar and your homework, write things down, and tidy your folders.
          Anything that changes something waits for your yes first.
        </p>
      </Reveal>

      <div className="chat-suggestions">
        {SUGGESTIONS.map((suggestion, index) => (
          <Reveal key={suggestion} delay={0.2 + index * 0.05} distance={8}>
            <button className="chip specular" onClick={() => onPick(suggestion)}>
              {suggestion}
            </button>
          </Reveal>
        ))}
      </div>
    </div>
  )
}
