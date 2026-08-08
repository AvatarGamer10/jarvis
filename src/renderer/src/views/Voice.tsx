import {
  AudioLines,
  Check,
  Download,
  Mic,
  RotateCcw,
  Square,
  TriangleAlert,
  Volume2
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@shared/types'
import AssistantLogo, { type AssistantState } from '../components/AssistantLogo'
import StreamingText from '../components/StreamingText'
import VoiceOutputSetup from '../components/VoiceOutputSetup'
import { BlurIn, Reveal, Swap } from '../components/anim'
import { MicUnavailable, record, type Recording } from '../lib/mic'
import { sound } from '../lib/sound'
import {
  loadModel,
  modelReady,
  bundleForQuality,
  QUALITY_INFO,
  rememberQuality,
  savedQuality,
  transcribe,
  type ModelProgress,
  type Quality
} from '../lib/stt'
import { tts } from '../lib/tts'
import {
  loadNeuralVoice,
  NEURAL_BUNDLE,
  neuralPreferred,
  neuralReady,
  voiceConfigured
} from '../lib/neural-voice'

type Phase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Hold to talk',
  listening: 'Listening',
  transcribing: 'Working out what you said',
  thinking: 'Thinking',
  speaking: 'Speaking'
}

const ASSISTANT_STATE: Record<Phase, AssistantState> = {
  idle: 'idle',
  listening: 'listening',
  transcribing: 'thinking',
  thinking: 'thinking',
  speaking: 'speaking'
}

const SUGGESTIONS = [
  'What do I have this week?',
  'What is due tomorrow?',
  'Add a maths exam on Friday'
]

/**
 * Talking to Vilo.
 *
 * Push to talk, not a wake word. Detecting a name reliably takes a licensed
 * engine, and a homemade one has to transcribe continuously: it eats the
 * battery and mishears constantly. Holding a key never misfires and costs
 * nothing at rest.
 *
 * Both halves of the conversation stay on screen — your words above, Vilo's
 * below, arriving in time with the voice. Speech that is only audible is
 * unusable the moment you mishear a date, and every real assistant learns
 * this eventually.
 */
export default function Voice(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [said, setSaid] = useState('')
  const [answer, setAnswer] = useState('')
  const [spokenChars, setSpokenChars] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState<ModelProgress | null>(() =>
    modelReady()
      ? null
      : { phase: 'preparing', percent: 100, message: 'Checking installed listening files…' }
  )
  const [installed, setInstalled] = useState(modelReady)
  const [showOutputSetup, setShowOutputSetup] = useState(() => !voiceConfigured())

  const recording = useRef<Recording | null>(null)
  const getActivity = useCallback(() => recording.current?.level() ?? 0, [])
  const phaseRef = useRef(phase)

  /**
   * Opening the microphone takes a few milliseconds. If the key is released
   * inside that window, `finish` finds no recording, walks away, and the
   * microphone stays open forever. This flag catches that release so it can
   * be honoured as soon as the recording exists.
   */
  const releasedEarly = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // Installation lives on disk, not in this React process. On later launches
  // Vilo checks it and starts the local engine automatically instead of
  // showing the download gate again.
  useEffect(() => {
    if (modelReady()) {
      setInstalled(true)
      return
    }

    let current = true
    const quality = savedQuality()
    void window.vilo.models.status(bundleForQuality(quality)).then(async (result) => {
      if (!current) return
      if (!result.ok) {
        setModel({
          phase: 'error',
          percent: 0,
          kind: 'download',
          message: 'Vilo could not check the listening files',
          hint: result.error
        })
        return
      }
      if (!result.data.installed) {
        setModel(null)
        return
      }

      try {
        await loadModel((next) => current && setModel(next), quality)
        if (current) setInstalled(true)
      } catch {
        // loadModel publishes the actionable engine error.
      }
    })

    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    return () => {
      recording.current?.cancel()
      tts.stop()
    }
  }, [])

  // The listening worker is already opened above. Do the same for the chosen
  // realistic voice once the page is settled, but only when its verified files
  // are present: preloading must never become a surprise background download.
  useEffect(() => {
    if (!installed || showOutputSetup || !neuralPreferred() || neuralReady()) return

    let current = true
    let idle: number | null = null
    void window.vilo.models.status(NEURAL_BUNDLE).then((result) => {
      if (!current || !result.ok || !result.data.installed) return

      const prepare = (): void => {
        void loadNeuralVoice().catch((error: unknown) => {
          // The Voice output chooser owns the actionable repair state. A warm
          // up failure should not cover the listening UI with a second error.
          console.error('[voice] natural voice warm-up failed:', error)
        })
      }

      idle = window.requestIdleCallback(prepare, { timeout: 1_200 })
    })

    return () => {
      current = false
      if (idle === null) return
      window.cancelIdleCallback(idle)
    }
  }, [installed, showOutputSetup])

  const start = async (): Promise<void> => {
    if (phaseRef.current !== 'idle' || recording.current) return

    setError(null)
    setAnswer('')
    setSaid('')
    setSpokenChars(undefined)
    releasedEarly.current = false
    tts.stop()

    let next: Recording
    try {
      next = await record()
    } catch (err) {
      setError(
        err instanceof MicUnavailable ? err.message : `Could not record: ${(err as Error).message}`
      )
      return
    }

    recording.current = next

    // Released while the microphone was still opening: close it now.
    if (releasedEarly.current) {
      releasedEarly.current = false
      setPhase('listening')
      void finish()
      return
    }

    sound.play('nav')
    setPhase('listening')
  }

  const finish = async (): Promise<void> => {
    if (!recording.current) {
      releasedEarly.current = true
      return
    }
    if (phaseRef.current !== 'listening') return

    setPhase('transcribing')

    let text = ''
    try {
      const audio = await recording.current.stop()
      recording.current = null
      // Let React paint the transcription state before audio analysis begins.
      // Inference itself runs in a worker, so the animation keeps moving after
      // this frame instead of making the whole window look frozen.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      text = await transcribe(audio)
    } catch (err) {
      setError(`Could not understand the audio: ${(err as Error).message}`)
      setPhase('idle')
      return
    }

    if (!text) {
      setPhase('idle')
      setError('I did not hear anything. Try moving a little closer to the microphone.')
      return
    }

    setSaid(text)
    setPhase('thinking')

    const result = await window.vilo.agent.send(text)
    if (!result.ok) {
      setError(result.error)
      setPhase('idle')
      return
    }

    const reply = lastReply(result.data)
    setAnswer(reply)
    setSpokenChars(0)
    setPhase('speaking')

    tts.speak(reply, {
      onWord: setSpokenChars,
      onEnd: () => {
        // Undefined hands the caption back to its own clock, so any words
        // still queued finish arriving instead of freezing mid-sentence.
        setSpokenChars(undefined)
        setPhase('idle')
      }
    })
  }

  const stopSpeaking = (): void => {
    tts.stop()
    setSpokenChars(undefined)
    setPhase('idle')
  }

  // Space as an alternative to the mouse, ignored while a field has focus.
  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.repeat) return
      const tag = (event.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      event.preventDefault()
      void start()
    }
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') void finish()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // start/finish read the phase through a ref, so they never go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!installed) {
    return <VoiceSetup progress={model} onProgress={setModel} onReady={() => setInstalled(true)} />
  }

  if (showOutputSetup) {
    return (
      <VoiceOutputSetup
        mode="setup"
        onReady={() => setShowOutputSetup(false)}
        onCancel={voiceConfigured() ? () => setShowOutputSetup(false) : undefined}
      />
    )
  }

  const busy = phase === 'transcribing' || phase === 'thinking'

  return (
    <div className="voice">
      <div className="voice-stage">
        <Reveal blur={0} distance={14} className="voice-state-slot">
          <span className={`voice-state ${phase === 'idle' ? '' : 'live'}`} key={phase}>
            {PHASE_LABEL[phase]}
            {busy && (
              <span className="dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            )}
          </span>
        </Reveal>

        <div className="orb">
          <AssistantLogo
            size={300}
            state={ASSISTANT_STATE[phase]}
            className="voice-assistant"
            getActivity={getActivity}
          />
          <button
            className="orb-hit"
            disabled={busy}
            onPointerDown={start}
            onPointerUp={finish}
            onPointerLeave={() => phaseRef.current === 'listening' && void finish()}
            aria-label="Hold to talk"
          />
          {phase === 'listening' && <Level getLevel={getActivity} />}
        </div>

        {/* The transcript. Your words sit above Vilo's, in the order they
            happened, and both stay put until the next thing is said — an
            answer that vanishes when the voice stops is an answer you cannot
            check. */}
        <div className="voice-script">
          {said && (
            <p className="voice-said selectable" key={said}>
              <Mic aria-hidden="true" />
              <span>{said}</span>
            </p>
          )}

          {answer ? (
            <StreamingText
              text={answer}
              spokenChars={spokenChars}
              pace={tts.pace()}
              className="voice-caption selectable"
            />
          ) : (
            phase === 'idle' &&
            !said && (
              <p className="voice-caption quiet">
                Ask about your week, your homework, or what you still need to pass.
              </p>
            )
          )}
        </div>
      </div>

      <div className="voice-dock">
        {error && (
          <div className="alert error">
            <TriangleAlert />
            <span>{error}</span>
          </div>
        )}

        {phase === 'speaking' ? (
          <button className="btn" onClick={stopSpeaking}>
            <Square />
            Stop
          </button>
        ) : (
          <div className="row wrap voice-dock-actions">
            <span className="voice-hint">
              <AudioLines size={13} />
              Hold the orb, or hold <kbd>space</kbd>
            </span>
            <button className="btn ghost sm" onClick={() => setShowOutputSetup(true)}>
              <Volume2 />
              {tts.engine() === 'neural' ? 'Natural voice' : 'Built-in voice'}
            </button>
          </div>
        )}

        {phase === 'idle' && !answer && (
          <div className="voice-suggestions">
            {SUGGESTIONS.map((suggestion, index) => (
              <Reveal key={suggestion} delay={0.12 + index * 0.06} distance={8}>
                <span className="chip" style={{ cursor: 'default' }}>
                  {suggestion}
                </span>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A ring that swells with your voice while the microphone is open.
 *
 * Push-to-talk with no feedback is a coin flip — you find out whether the
 * microphone was working after you have finished the sentence. This is the
 * cheapest possible answer to that, and it is drawn straight from the same
 * level meter the character breathes with, outside React so it can run every
 * frame.
 */
function Level({ getLevel }: { getLevel: () => number }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frame = 0
    let smoothed = 0

    const tick = (): void => {
      // Attack fast, release slow: it should jump on a consonant and fall away
      // gently, not flicker at the frame rate.
      const level = Math.max(0, Math.min(1, getLevel()))
      smoothed += (level - smoothed) * (level > smoothed ? 0.4 : 0.08)
      ref.current?.style.setProperty('--level', smoothed.toFixed(3))
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [getLevel])

  return <span ref={ref} className="voice-level" aria-hidden="true" />
}

/**
 * The one-time download.
 *
 * Two sizes, both honest about what they cost, because the previous version of
 * this screen advertised 145 MB and then fetched 291 MB — and on a laptop that
 * is short of space that is not a rounding error, it is the difference between
 * a feature and a problem.
 */
function VoiceSetup({
  progress,
  onProgress,
  onReady
}: {
  progress: ModelProgress | null
  onProgress: (next: ModelProgress | null) => void
  onReady: () => void
}): JSX.Element {
  const [quality, setQuality] = useState<Quality>(savedQuality)
  const working = progress?.phase === 'downloading' || progress?.phase === 'preparing'

  const install = async (): Promise<void> => {
    rememberQuality(quality)
    try {
      await loadModel(onProgress, quality)
      sound.play('confirm')
      onReady()
    } catch {
      // loadModel has already published the error state.
    }
  }

  const retry = (): void => {
    if (progress?.kind === 'engine') {
      // ONNX serialises engine startup through module-level promises. Once one
      // rejects, a page reload is the only honest clean retry; re-downloading
      // already verified model files cannot repair the runtime.
      window.location.reload()
      return
    }
    void install()
  }

  return (
    <div className="voice-setup">
      <AssistantLogo size={200} className="voice-assistant" />

      <BlurIn as="h2" className="display voice-setup-title" text="Let Vilo hear you" />

      <Reveal delay={0.18}>
        <p>
          Speech recognition runs inside the app, so nothing you say is ever uploaded. It downloads
          once and works offline from then on.
        </p>
      </Reveal>

      <Swap swapKey={working ? 'working' : (progress?.phase ?? 'choose')} className="voice-setup-body">
        {working ? (
          <div className="voice-progress">
            <div className="row-between">
              <span className="meta">{progress?.message}</span>
              <span className="mono">
                {progress?.phase === 'preparing' ? '' : `${progress?.percent ?? 0}%`}
              </span>
            </div>
            <div className="progress">
              <div
                className={`progress-fill ${progress?.phase === 'preparing' ? 'indeterminate' : ''}`}
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
            <span className="meta">You can carry on using the rest of Vilo while this runs.</span>
          </div>
        ) : (
          <div className="voice-choices">
            {(['balanced', 'small'] as const).map((option) => {
              const info = QUALITY_INFO[option]
              return (
                <button
                  key={option}
                  className="provider specular"
                  aria-pressed={quality === option}
                  onClick={() => {
                    setQuality(option)
                    onProgress(null)
                  }}
                >
                  <strong>
                    {quality === option ? <Check size={15} /> : <Download size={15} />}
                    {info.label}
                    <span className="mono voice-size">{info.mb} MB</span>
                  </strong>
                  <span>{info.detail}</span>
                </button>
              )
            })}
          </div>
        )}
      </Swap>

      {progress?.phase === 'error' && (
        <div className="alert error voice-setup-error">
          <TriangleAlert />
          <span>
            <strong>{progress.message}</strong>
            {progress.hint && <em>{progress.hint}</em>}
          </span>
        </div>
      )}

      {!working && (
        <button className="btn primary lg" onClick={retry}>
          {progress?.phase === 'error' ? <RotateCcw /> : <Download />}
          {progress?.kind === 'engine'
            ? 'Restart voice engine'
            : progress?.phase === 'error'
              ? 'Resume download'
              : `Download · ${QUALITY_INFO[quality].mb} MB`}
        </button>
      )}
    </div>
  )
}

/**
 * The agent returns several messages when it uses tools. For reading aloud
 * only the last one with text matters: reciting "I called calendar_list" helps
 * nobody.
 */
function lastReply(messages: ChatMessage[]): string {
  const withText = messages.filter((m) => m.role === 'assistant' && m.text.trim())
  return withText.at(-1)?.text ?? 'I was not sure how to answer that.'
}
