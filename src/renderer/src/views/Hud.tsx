import { Maximize2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@shared/types'
import AssistantLogo, { type AssistantState } from '../components/AssistantLogo'
import StreamingText from '../components/StreamingText'
import { MicUnavailable, record, type Recording } from '../lib/mic'
import { loadModel, modelReady, transcribe } from '../lib/stt'
import { tts } from '../lib/tts'

type Phase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error'

const ORB_STATE: Record<Phase, AssistantState> = {
  idle: 'idle',
  listening: 'listening',
  transcribing: 'thinking',
  thinking: 'thinking',
  speaking: 'speaking',
  error: 'idle'
}

/** Pixels of movement before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4

/**
 * The floating orb.
 *
 * Deliberately small: the entire point is to sit beside whatever you are
 * actually doing, and a panel that takes real space ends up in the way and
 * then closed. It only grows when it has something to say.
 *
 * The conversation happens here, in place. If it opened the main window it
 * would break the one thing it exists to avoid.
 */
export default function Hud(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [said, setSaid] = useState('')
  const [answer, setAnswer] = useState('')
  const [spokenChars, setSpokenChars] = useState<number | undefined>(undefined)
  const [note, setNote] = useState('')
  const [due, setDue] = useState<{ today: number; overdue: number } | null>(null)

  const recording = useRef<Recording | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const phaseRef = useRef(phase)

  const open = phase !== 'idle'

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    tts.prepare()
    return () => {
      recording.current?.cancel()
      tts.stop()
    }
  }, [])

  // The window grows and shrinks from the main process, which is the only
  // side that can change its real size.
  useEffect(() => {
    void window.vilo.hud.expand(open)
  }, [open])

  /**
   * What is due, so the button says something at rest instead of being a
   * blank circle. Every five minutes — deadlines do not change by the second.
   */
  useEffect(() => {
    let alive = true

    const look = async (): Promise<void> => {
      const result = await window.vilo.brief.counts()
      if (alive && result.ok) setDue(result.data)
    }

    void look()
    const timer = setInterval(() => void look(), 5 * 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const getLevel = useCallback((): number => recording.current?.level() ?? 0, [])

  const fail = (message: string): void => {
    setNote(message)
    setPhase('error')
    // Clears itself: a HUD stuck open showing an error is worse than one that
    // says nothing at all.
    setTimeout(() => setPhase('idle'), 4000)
  }

  const start = async (): Promise<void> => {
    setSaid('')
    setAnswer('')
    setNote('')
    setSpokenChars(undefined)
    tts.stop()

    if (!modelReady()) {
      setPhase('transcribing')
      setNote('Getting speech ready…')
      try {
        await loadModel()
      } catch {
        fail('The speech model is missing. Open Vilo to download it.')
        return
      }
    }

    try {
      recording.current = await record()
    } catch (err) {
      fail(err instanceof MicUnavailable ? err.message : 'Could not open the microphone.')
      return
    }

    setNote('')
    setPhase('listening')
  }

  const finish = async (): Promise<void> => {
    if (!recording.current) return
    setPhase('transcribing')

    let text = ''
    try {
      const audio = await recording.current.stop()
      recording.current = null
      text = await transcribe(audio)
    } catch {
      fail('I could not make out the audio.')
      return
    }

    if (!text) {
      fail('I did not hear anything.')
      return
    }

    setSaid(text)
    setPhase('thinking')

    const result = await window.vilo.agent.send(text)
    if (!result.ok) {
      fail(result.error)
      return
    }

    const reply = lastReply(result.data)
    setAnswer(reply)
    setSpokenChars(0)
    setPhase('speaking')

    tts.speak(reply, {
      onWord: setSpokenChars,
      onEnd: () => {
        setSpokenChars(undefined)
        setPhase('idle')
      }
    })
  }

  // --- Drag or press --------------------------------------------------------
  //
  // Holding cannot mean both "talk" and "move", so the gesture decides: if the
  // pointer travels, it is a drag; if it does not, it is a click that starts
  // the microphone.

  const onPress = (event: React.MouseEvent): void => {
    if (event.button !== 0) return
    drag.current = { x: event.screenX, y: event.screenY, moved: false }

    const onMove = (move: MouseEvent): void => {
      if (!drag.current) return
      const dx = move.screenX - drag.current.x
      const dy = move.screenY - drag.current.y

      if (!drag.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return

      drag.current.moved = true
      drag.current.x = move.screenX
      drag.current.y = move.screenY
      void window.vilo.hud.move(dx, dy)
    }

    const onRelease = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onRelease)

      const wasClick = drag.current?.moved === false
      drag.current = null
      if (!wasClick) return

      const current = phaseRef.current
      if (current === 'listening') void finish()
      else if (current === 'idle' || current === 'error') void start()
      else if (current === 'speaking') {
        tts.stop()
        setSpokenChars(undefined)
        setPhase('idle')
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onRelease)
  }

  const hint =
    phase === 'listening'
      ? 'Click to finish'
      : phase === 'thinking'
        ? 'Thinking'
        : phase === 'transcribing'
          ? note || 'Working it out'
          : ''

  const pending = (due?.today ?? 0) + (due?.overdue ?? 0)

  return (
    <div className="hud">
      <div className="hud-row">
        <button
          className="hud-orb"
          onMouseDown={onPress}
          title="Click to talk. Drag to move."
        >
          {/* The same face as the main window, at a size that fits beside
              whatever you are actually working on. Pointer tracking is off:
              this window follows the cursor around the desktop already, and
              having the eyes chase it as well is too much. */}
          <AssistantLogo
            size={54}
            state={ORB_STATE[phase]}
            interactive={false}
            getActivity={getLevel}
          />

          {/* Late work outranks today's: if something is overdue, that is the
              first thing you need to know. */}
          {!open && pending > 0 && (
            <span className={`hud-count ${due?.overdue ? 'late' : ''}`}>
              {due?.overdue ? due.overdue : due?.today}
            </span>
          )}
        </button>

        {open && (
          <div className="hud-actions">
            <button onClick={() => void window.vilo.hud.openApp()} title="Open Vilo">
              <Maximize2 />
            </button>
            <button onClick={() => void window.vilo.hud.close()} title="Hide the orb">
              <X />
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="hud-panel">
          {hint && (
            <p className="hud-status">
              {hint}
              <span className="dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </p>
          )}
          {phase === 'error' && <p className="hud-status">{note}</p>}
          {said && <p className="hud-said">“{said}”</p>}
          {answer && (
            <StreamingText
              text={answer}
              spokenChars={spokenChars}
              pace={tts.pace()}
              className="hud-answer"
            />
          )}
        </div>
      )}
    </div>
  )
}

function lastReply(messages: ChatMessage[]): string {
  const withText = messages.filter((m) => m.role === 'assistant' && m.text.trim())
  return withText.at(-1)?.text ?? 'I was not sure how to answer that.'
}
