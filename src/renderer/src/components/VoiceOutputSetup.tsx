import { Check, Download, RefreshCw, TriangleAlert, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import AssistantLogo from './AssistantLogo'
import { BlurIn, Reveal, Swap } from './anim'
import { Field } from './ui'
import {
  loadNeuralVoice,
  neuralPreferred,
  neuralReady,
  NEURAL_BUNDLE,
  NEURAL_MB,
  NEURAL_VOICES,
  rememberNeuralVoice,
  savedNeuralVoice,
  setNeuralPreferred,
  speakNeural,
  type NeuralProgress
} from '../lib/neural-voice'
import { sound } from '../lib/sound'
import { tts } from '../lib/tts'

interface VoiceOutputSetupProps {
  mode: 'setup' | 'settings'
  onReady?: () => void
  onCancel?: () => void
}

/**
 * One source of truth for choosing how Vilo speaks.
 *
 * In Voice it is the second onboarding stage, immediately after the listening
 * model. In Settings it expands into the full voice picker. Keeping the engine
 * loading here prevents the two screens from drifting into different download
 * and recovery behaviour again.
 */
export default function VoiceOutputSetup({
  mode,
  onReady,
  onCancel
}: VoiceOutputSetupProps): JSX.Element {
  const [systemVoices, setSystemVoices] = useState(() => tts.options())
  const [systemVoice, setSystemVoice] = useState(() => tts.voiceName())
  const [installed, setInstalled] = useState(neuralReady)
  const [checkingInstall, setCheckingInstall] = useState(!neuralReady())
  const [engine, setEngine] = useState<'neural' | 'system'>(() =>
    neuralPreferred() ? 'neural' : 'system'
  )
  const [voice, setVoice] = useState(savedNeuralVoice)
  const [progress, setProgress] = useState<NeuralProgress | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)

  useEffect(() => {
    const update = (): void => {
      setSystemVoices(tts.options())
      setSystemVoice(tts.voiceName())
    }
    window.speechSynthesis?.addEventListener('voiceschanged', update)
    const timer = window.setTimeout(update, 400)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', update)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (neuralReady()) {
      setInstalled(true)
      setCheckingInstall(false)
      return
    }

    let current = true
    void window.vilo.models.status(NEURAL_BUNDLE).then(async (result) => {
      if (!current) return
      setCheckingInstall(false)
      if (!result.ok) {
        setProgress({
          phase: 'error',
          percent: 0,
          kind: 'download',
          message: 'Vilo could not check the installed voice',
          hint: result.error
        })
        return
      }

      setInstalled(result.data.installed)
      if (!result.data.installed || !neuralPreferred()) return

      try {
        await loadNeuralVoice((next) => current && setProgress(next))
      } catch {
        // The loader publishes the engine-specific recovery state.
      }
    })

    return () => {
      current = false
    }
  }, [])

  const useSystem = (): void => {
    setEngine('system')
    setProgress(null)
    setNeuralPreferred(false)
    sound.play('confirm')
    onReady?.()
  }

  const useNatural = async (): Promise<void> => {
    setEngine('neural')
    try {
      if (!neuralReady()) await loadNeuralVoice(setProgress)
      setInstalled(true)
      sound.play('confirm')
      if (mode === 'settings') setNeuralPreferred(true)
    } catch {
      // loadNeuralVoice has already published the actionable error state.
    }
  }

  const selectVoice = (id: string): void => {
    setVoice(id)
    rememberNeuralVoice(id)
    setNeuralPreferred(true)
    sound.play('confirm')
    onReady?.()
  }

  const previewVoice = (id: string): void => {
    setPreviewing(id)
    void speakNeural('Hi, I’m Vilo. Ready when you are.', id, {
      onEnd: () => setPreviewing((current) => (current === id ? null : current))
    }).catch(() => setPreviewing((current) => (current === id ? null : current)))
  }

  const retryVoice = (): void => {
    if (progress?.kind === 'engine') {
      window.location.reload()
      return
    }
    void useNatural()
  }

  const working =
    checkingInstall || progress?.phase === 'downloading' || progress?.phase === 'preparing'
  const settings = mode === 'settings'

  return (
    <div className={settings ? 'voice-output-settings' : 'voice-setup voice-output-setup'}>
      {!settings && (
        <>
          <AssistantLogo size={150} className="voice-assistant" />
          <BlurIn as="h2" className="display voice-setup-title" text="Let Vilo speak back" />
          <Reveal delay={0.16}>
            <p>
              Choose a natural offline voice, or use one already built into this computer. You can
              change it later without touching the listening model.
            </p>
          </Reveal>
        </>
      )}

      <div className="provider-grid voice-output-options">
        <button
          className="provider specular"
          aria-pressed={engine === 'neural'}
          disabled={working}
          onClick={() => void useNatural()}
        >
          <strong>
            Realistic voice
            <span className="voice-tag">Recommended</span>
          </strong>
          <span>
            {installed
              ? 'Choose from ten realistic voices. Everything runs on this computer.'
              : `Sounds more human. ${NEURAL_MB} MB once, then it works offline.`}
          </span>
        </button>

        <button
          className="provider specular"
          aria-pressed={engine === 'system'}
          onClick={useSystem}
        >
          <strong>Built-in voice</strong>
          <span>Already on this computer. No download, no waiting, and it speaks instantly.</span>
        </button>
      </div>

      <Swap swapKey={working ? 'busy' : engine === 'neural' && installed ? 'neural' : engine}>
        {working ? (
          <div className="card voice-progress voice-output-detail">
            <div className="row-between">
              <span className="meta">
                {checkingInstall ? 'Checking installed voice files…' : progress?.message}
              </span>
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
            <span className="meta">
              Verified download progress is kept if Vilo closes or the connection drops.
            </span>
          </div>
        ) : engine === 'neural' && installed ? (
          <div className="card col voice-output-detail voice-realistic-picker" style={{ gap: 'var(--s-3)' }}>
            <div className="row-between voice-picker-heading">
              <span className="field-label">Choose your realistic voice</span>
              <span className="meta">Use the speaker to compare</span>
            </div>
            <div className="voice-grid">
              {NEURAL_VOICES.map((option) => {
                const selected = voice === option.id
                return (
                  <div className="provider voice-option" data-selected={selected} key={option.id}>
                    <div className="voice-option-copy">
                      <strong>
                        {selected && <Check aria-hidden="true" />}
                        {option.name}
                      </strong>
                      <span>{option.note}</span>
                    </div>
                    <button
                      className="voice-preview-button"
                      aria-label={
                        previewing === option.id ? `Playing ${option.name}` : `Hear ${option.name}`
                      }
                      title={`Hear ${option.name}`}
                      disabled={previewing !== null}
                      onClick={() => previewVoice(option.id)}
                    >
                      {previewing === option.id ? <span className="spinner" /> : <Volume2 />}
                    </button>
                    <button
                      className="voice-select-button"
                      aria-pressed={selected}
                      onClick={() => selectVoice(option.id)}
                    >
                      {selected && <Check aria-hidden="true" />}
                      {selected && settings ? 'Selected' : 'Select'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : settings && engine === 'system' ? (
          <div className="card col voice-output-detail" style={{ gap: 'var(--s-3)' }}>
            <Field label="Voice">
              <select
                className="select"
                value={systemVoice ?? ''}
                onChange={(event) => {
                  tts.choose(event.target.value)
                  setSystemVoice(event.target.value)
                }}
              >
                {systemVoices.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.name} · {option.lang}
                    {option.premium ? ' · high quality' : ''}
                  </option>
                ))}
              </select>
            </Field>

            <div className="row wrap">
              <button className="btn sm" onClick={() => tts.preview()}>
                <Volume2 />
                Hear it
              </button>
              {tts.couldBeBetter() && (
                <span className="meta">
                  {navigator.userAgent.includes('Mac')
                    ? 'More voices: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices.'
                    : 'You can install more built-in voices from your computer’s speech settings.'}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </Swap>

      {progress?.phase === 'error' && (
        <div className="alert error voice-output-error">
          <TriangleAlert />
          <span className="voice-output-error-copy">
            <strong>{progress.message}</strong>
            {progress.hint && <em>{progress.hint}</em>}
          </span>
          <div className="voice-output-error-actions">
            <button className="btn sm" onClick={retryVoice}>
              {progress.kind === 'engine' ? <RefreshCw /> : <Download />}
              {progress.kind === 'engine' ? 'Restart Vilo' : 'Resume'}
            </button>
            <button className="btn sm" onClick={useSystem}>
              <Volume2 />
              Use built-in
            </button>
          </div>
        </div>
      )}

      {!settings && onCancel && !working && (
        <button className="btn ghost sm" onClick={onCancel}>
          Back to voice
        </button>
      )}
    </div>
  )
}
