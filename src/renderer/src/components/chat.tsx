import { ArrowDown, Check, ChevronRight, Copy, Paperclip, Wrench, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { ToolCallRecord } from '@shared/types'

/**
 * The parts a chat is built from.
 *
 * The structure follows the one Vercel's AI Elements settled on — a
 * conversation that sticks to the bottom, a message, a response, a collapsed
 * record of the tools that ran, a prompt input with its own toolbar — because
 * that division has been worked out properly and there is no point pretending
 * otherwise. What is here is written from scratch against Vilo's own tokens
 * and behaves differently in the places where the two apps differ: this one
 * runs tools that change your calendar, so what it did is a first-class part
 * of the transcript rather than a debugging detail.
 */

// -------------------------------------------------------------------------
// Conversation
// -------------------------------------------------------------------------

/**
 * A scroller that follows new content, and stops following the moment you
 * scroll away from the bottom yourself.
 *
 * The second half is the part everyone forgets. Auto-scrolling unconditionally
 * means you cannot read anything above the fold while an answer is arriving —
 * it drags you back down every time a word lands.
 */
export function Conversation({ children }: { children: ReactNode }): JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(true)

  const toBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = scroller.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    const node = scroller.current
    if (!node) return

    const onScroll = (): void => {
      // A generous threshold: "near the bottom" has to survive the last line
      // of an answer growing by a pixel or two as fonts settle.
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight
      setStuck(distance < 80)
    }

    node.addEventListener('scroll', onScroll, { passive: true })
    return () => node.removeEventListener('scroll', onScroll)
  }, [])

  // Watching the content rather than a dependency list, so it keeps pace with
  // text arriving a word at a time as well as with whole new messages.
  useEffect(() => {
    const node = scroller.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      if (stuck) node.scrollTo({ top: node.scrollHeight })
    })
    Array.from(node.children).forEach((child) => observer.observe(child))
    return () => observer.disconnect()
  }, [stuck, children])

  return (
    <div className="conversation">
      <div className="conversation-scroll scroll" ref={scroller}>
        <div className="conversation-inner">{children}</div>
      </div>

      {!stuck && (
        <button className="conversation-jump btn sm pill" onClick={() => toBottom()}>
          <ArrowDown />
          Latest
        </button>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------
// Message
// -------------------------------------------------------------------------

/**
 * One turn.
 *
 * Only your side gets a surface. Vilo's answers are set as plain text on the
 * page, at full measure, because they are the thing you came to read — putting
 * them in a bubble makes a paragraph look like a text message and caps the
 * line length for no reason. Your own lines are short and benefit from being
 * visibly yours.
 */
export function Message({
  role,
  children
}: {
  role: 'user' | 'assistant'
  children: ReactNode
}): JSX.Element {
  return (
    <article className={`msg msg-${role}`}>
      <div className="msg-body">{children}</div>
    </article>
  )
}

/** The row of small actions under an answer. Appears on hover. */
export function Actions({ children }: { children: ReactNode }): JSX.Element {
  return <div className="msg-actions">{children}</div>
}

export function CopyAction({ text }: { text: string }): JSX.Element {
  const [done, setDone] = useState(false)

  return (
    <button
      className="btn ghost sm"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setDone(true)
        window.setTimeout(() => setDone(false), 1600)
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

// -------------------------------------------------------------------------
// Tools
// -------------------------------------------------------------------------

/**
 * What Vilo actually did, folded away.
 *
 * Collapsed by default and openable, rather than either always-on or hidden.
 * Always-on turns every answer into a log; hidden means an assistant that
 * edits your calendar gives you no way to see what it touched. One line that
 * says how many, and the detail a click away.
 */
export function Tools({ calls }: { calls: ToolCallRecord[] }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (calls.length === 0) return null

  const failed = calls.filter((call) => !call.ok).length

  return (
    <div className="tools" data-open={open}>
      <button className="tools-head" onClick={() => setOpen((value) => !value)}>
        <ChevronRight className="tools-caret" />
        <Wrench />
        <span>
          {calls.length} {calls.length === 1 ? 'action' : 'actions'}
          {failed > 0 && ` · ${failed} failed`}
        </span>
      </button>

      {open && (
        <div className="tools-list">
          {calls.map((call, index) => (
            <div
              key={`${call.name}-${index}`}
              className={`tools-row ${call.ok ? '' : 'failed'}`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              {call.ok ? <Check /> : <X />}
              <span className="mono">{call.name}</span>
              <span className="truncate">{call.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------
// Prompt input
// -------------------------------------------------------------------------

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
  /** Rendered on the left of the toolbar — model name, usage, and so on. */
  toolbar?: ReactNode
  /** Rendered on the right, before the send button. */
  actions?: ReactNode
  /** Attachment chips, above the text they belong to. */
  attachments?: ReactNode
}

/**
 * The composer.
 *
 * Grows with what you type up to a ceiling the stylesheet sets, then scrolls.
 * The height is measured rather than guessed, and reset to `auto` first, or it
 * only ever grows and never shrinks when you delete a line.
 */
export function PromptInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = 'Ask Vilo…',
  toolbar,
  actions,
  attachments
}: PromptInputProps): JSX.Element {
  const box = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const node = box.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [value])

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {attachments}

      <textarea
        ref={box}
        rows={1}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line. The opposite is what
          // people expect from a chat, and this is a chat.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />

      {/*
       * The toolbar.
       *
       * Everything that belongs to *composing* a message lives on this row and
       * nowhere else — which model is answering, how to say it out loud
       * instead, and send. What does not belong here is anything destructive:
       * "clear the conversation" sat next to Send in the last version, one
       * button away from the thing you press twenty times an hour.
       */}
      <div className="composer-foot">
        <div className="composer-tools">{toolbar}</div>
        <span className="spacer" />
        {actions}
        <button
          className="btn primary sm icon"
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Send"
        >
          <SendMark />
        </button>
      </div>
    </form>
  )
}

/**
 * A control on the composer toolbar.
 *
 * Deliberately quieter than a `.btn`: these sit under the thing you are
 * typing and must not compete with it, or with Send.
 */
export function ComposerButton({
  onClick,
  title,
  children
}: {
  onClick: () => void
  title: string
  children: ReactNode
}): JSX.Element {
  return (
    <button type="button" className="composer-tool" onClick={onClick} title={title}>
      {children}
    </button>
  )
}

/**
 * A file riding along with the next message.
 *
 * Shown above the text rather than beside the toolbar, because it is part of
 * what you are about to send — and because a file you have forgotten you
 * attached is a file whose contents you did not mean to hand to a model.
 */
export function AttachmentChip({
  name,
  bytes,
  onRemove
}: {
  name: string
  bytes: number
  onRemove: () => void
}): JSX.Element {
  return (
    <div className="attachment">
      <Paperclip />
      <span className="truncate">{name}</span>
      <span className="mono">{bytes < 1000 ? `${bytes} B` : `${Math.round(bytes / 1000)} KB`}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${name}`}>
        <X />
      </button>
    </div>
  )
}

/** The send glyph, drawn here so its weight matches the rest of the app. */
function SendMark(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Vilo thinking.
 *
 * A line of light travelling across the width of a word, rather than three
 * bouncing dots. Dots are everywhere; this reads as something being worked
 * out and takes no more space.
 */
export function Thinking({ label = 'Thinking' }: { label?: string }): JSX.Element {
  return (
    <span className="thinking" aria-label={label}>
      {label}
    </span>
  )
}
