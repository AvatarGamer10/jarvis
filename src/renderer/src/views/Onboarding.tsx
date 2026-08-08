import { ArrowRight, Check, KeyRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { AuthStatus, LlmProviderId } from '@shared/types'
import AssistantLogo from '../components/AssistantLogo'
import Greeting from '../components/Greeting'
import Logo from '../components/Logo'
import { BlurIn, EASE, Reveal, Swap } from '../components/anim'
import { Field } from '../components/ui'
import { sound } from '../lib/sound'

const STEPS = ['welcome', 'google', 'model', 'ready'] as const
type Step = (typeof STEPS)[number]

interface Props {
  onDone: () => void | Promise<void>
}

/**
 * First run.
 *
 * Three decisions and a hello, and both of the decisions can be postponed —
 * you can reach the app with neither an account nor a model and everything
 * still opens, just emptier. Setup that refuses to let you in until every
 * field is filled is how people decide an app is not worth it.
 */
export default function Onboarding({ onDone }: Props): JSX.Element {
  const [step, setStep] = useState<Step>('welcome')
  /** Which way the steps are travelling, so Back reverses the animation. */
  const [back, setBack] = useState(false)

  const go = (next: Step): void => {
    sound.play('nav')
    setBack(STEPS.indexOf(next) < STEPS.indexOf(step))
    setStep(next)
  }

  const finish = (): void => {
    sound.play('start')
    void onDone()
  }

  const index = STEPS.indexOf(step)

  return (
    <div className="onboard">
      <header className="onboard-head">
        <Logo size={22} opacity={0.94} />
        <span className="rail-name">Vilo</span>
        <div className="onboard-progress" aria-hidden="true">
          {STEPS.map((id, position) => (
            <i key={id} className={position <= index ? 'on' : ''} />
          ))}
        </div>
      </header>

      {/*
       * One step dissolves into the next in place.
       *
       * `mode="wait"` matters: overlapping two steps means two sets of buttons
       * on screen at once, and on a setup flow that is how people click the
       * thing that is on its way out.
       */}
      <AnimatePresence mode="wait" initial={false} custom={back}>
        <motion.div
          key={step}
          className="onboard-step"
          custom={back}
          initial={{ opacity: 0, x: back ? -26 : 26, filter: 'blur(8px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: back ? 26 : -26, filter: 'blur(8px)' }}
          transition={{ duration: 0.42, ease: EASE }}
        >
          {step === 'welcome' && (
            <>
              <div className="onboard-body">
                {/* No blur on the way in: this one is a live animation loop and
                    starting it behind a filter costs a frame or two of it. */}
                <Reveal blur={0} distance={18} duration={0.8}>
                  <AssistantLogo size={210} className="onboard-assistant" />
                </Reveal>

                <Greeting />

                <BlurIn
                  delay={0.35}
                  text="Vilo keeps track of your week — your classes, your homework, your exams — and does the tedious parts for you. Talk to it or type at it; either way, anything that changes something waits for your yes first."
                />
              </div>

              <footer className="onboard-foot">
                <span className="meta onboard-authors">Created by Enzoreael &amp; Noox</span>
                <button className="btn primary lg" onClick={() => go('google')}>
                  Get started
                  <ArrowRight />
                </button>
              </footer>
            </>
          )}

          {step === 'google' && (
            <GoogleStep onNext={() => go('model')} onBack={() => go('welcome')} />
          )}

          {step === 'model' && <ModelStep onNext={() => go('ready')} onBack={() => go('google')} />}

          {step === 'ready' && (
            <>
              <div className="onboard-body">
                <Reveal blur={0} distance={18} duration={0.8}>
                  <AssistantLogo size={210} className="onboard-assistant is-ready" state="speaking" />
                </Reveal>
                <BlurIn as="h1" className="display" text="You're set." stagger={0.06} />
                <Reveal delay={0.3}>
                  <p>
                    Hold the orb and ask something — “what do I have this week?” is a good first
                    try. Everything else lives in the sidebar, and <kbd>⌘K</kbd> jumps anywhere.
                  </p>
                </Reveal>
              </div>

              <footer className="onboard-foot">
                <span className="spacer" />
                <button className="btn primary lg" onClick={finish}>
                  Open Vilo
                  <ArrowRight />
                </button>
              </footer>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** Connecting Google. Skippable — the app still runs without it. */
function GoogleStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.vilo.auth.status().then((result) => {
      if (result.ok) setStatus(result.data)
    })
  }, [])

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    const result = await window.vilo.auth.signIn()
    if (result.ok) {
      setStatus(result.data)
      sound.play('confirm')
    } else {
      setError(result.error)
    }
    setBusy(false)
  }

  const connected = status?.connected === true

  return (
    <>
      <div className="onboard-body">
        <BlurIn as="h1" className="display" text="Connect your school account" stagger={0.045} />
        <Reveal delay={0.24}>
          <p>
            This is what lets Vilo see your calendar and your Classroom assignments. It only ever
            reads them — nothing is posted, submitted or deleted on your behalf.
          </p>
        </Reveal>

        <Swap swapKey={connected ? 'in' : busy ? 'waiting' : 'out'} className="onboard-card">
          {connected ? (
            <div className="card">
              <div className="row">
                <span className="status-dot on" />
                <div className="grow">
                  <div className="item-title">{status?.email}</div>
                  <div className="item-sub">Calendar and Classroom connected</div>
                </div>
                <Check size={16} />
              </div>
            </div>
          ) : (
            <div className="col" style={{ alignItems: 'center', gap: 'var(--s-3)' }}>
              <button className="btn primary lg" onClick={connect} disabled={busy}>
                {busy ? 'Waiting for your browser…' : 'Connect with Google'}
              </button>
              {busy && (
                <p className="meta">
                  A browser window has opened. Come back here once you have approved it.
                </p>
              )}
            </div>
          )}
        </Swap>

        {error && <div className="alert error">{error}</div>}
      </div>

      <footer className="onboard-foot">
        <button className="btn ghost" onClick={onBack}>
          Back
        </button>
        <button className={`btn ${connected ? 'primary' : ''}`} onClick={onNext}>
          {connected ? 'Continue' : 'Skip for now'}
          <ArrowRight />
        </button>
      </footer>
    </>
  )
}

/**
 * Choosing the model.
 *
 * OpenRouter is first and pre-selected because it is the only one of the three
 * that works within a minute of installing: no eight-gigabyte download, no
 * Google Cloud project. The local option is still here for anyone who wants
 * it, but it is no longer the road everybody is pushed down.
 */
/**
 * The five worth offering on the first run.
 *
 * Settings has all eight. Setup does not, because a first-run screen asking
 * someone to pick between eight things they have never heard of is a screen
 * they close — these are the ones that go from nothing to a working assistant
 * fastest, and everything else is one click away afterwards.
 *
 * No logos here either; see the note in Settings.
 */
const CHOICES: {
  id: LlmProviderId
  name: string
  blurb: string
  keys?: { url: string; label: string }
}[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    blurb: 'One key, most models. Nothing to install — start in a minute.',
    keys: { url: 'https://openrouter.ai/keys', label: 'openrouter.ai/keys' }
  },
  {
    id: 'groq',
    name: 'Groq',
    blurb: 'Open models, answered almost instantly. Generous free tier.',
    keys: { url: 'https://console.groq.com/keys', label: 'console.groq.com/keys' }
  },
  {
    id: 'openai',
    name: 'OpenAI',
    blurb: 'GPT models, straight from the source.',
    keys: { url: 'https://platform.openai.com/api-keys', label: 'platform.openai.com' }
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    blurb: 'Claude models, direct. Strong at following instructions.',
    keys: { url: 'https://console.anthropic.com/settings/keys', label: 'console.anthropic.com' }
  },
  {
    id: 'gemini',
    name: 'Gemini',
    blurb: "Google's own API, with a free tier.",
    keys: { url: 'https://aistudio.google.com/apikey', label: 'aistudio.google.com' }
  },
  {
    id: 'ollama',
    name: 'Ollama',
    blurb: 'Runs on this Mac. Free and private, but wants several gigabytes.'
  }
]

function ModelStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }): JSX.Element {
  const [provider, setProvider] = useState<LlmProviderId>('openrouter')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const chosen = CHOICES.find((option) => option.id === provider)

  const save = async (): Promise<void> => {
    setBusy(true)

    const patch: Record<string, string> = { llmProvider: provider }
    if (chosen?.keys && key.trim()) patch[`${provider}ApiKey`] = key.trim()

    const result = await window.vilo.settings.update(patch)
    if (result.ok) {
      sound.play('confirm')
      setSaved(true)
      onNext()
    }
    setBusy(false)
  }

  return (
    <>
      <div className="onboard-body">
        <BlurIn as="h1" className="display" text="Give Vilo a brain" stagger={0.05} />
        <Reveal delay={0.2}>
          <p>
            Vilo does not ship with a model of its own. Point it at one — you can change your mind
            later in Settings, and it takes effect straight away.
          </p>
        </Reveal>

        <div className="provider-grid onboard-card">
          {CHOICES.map((option, position) => (
            <Reveal key={option.id} delay={0.28 + position * 0.05} distance={8}>
              <button
                className="provider specular"
                aria-pressed={provider === option.id}
                onClick={() => setProvider(option.id)}
              >
                <strong>{option.name}</strong>
                <span>{option.blurb}</span>
              </button>
            </Reveal>
          ))}
        </div>

        {/* Height-aware, so choosing Ollama and then changing your mind does
            not make the footer buttons jump out from under the pointer. */}
        <Swap swapKey={provider} className="onboard-card">
          {chosen?.keys ? (
            <Field
              label={`${chosen.name} API key`}
              hint={
                <>
                  Get one at{' '}
                  <button
                    className="link"
                    onClick={() => void window.vilo.shell.openExternal(chosen.keys!.url)}
                  >
                    {chosen.keys.label}
                  </button>
                  . It is stored in your Mac's keychain, and you can paste it later instead.
                </>
              }
            >
              <input
                className="input"
                type="password"
                value={key}
                placeholder="sk-…"
                autoFocus
                onChange={(event) => setKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void save()
                }}
              />
            </Field>
          ) : (
            <div className="alert">
              <KeyRound />
              <span>
                Install Ollama from ollama.com, then pull a model that supports tools — llama3.1:8b
                is a good start. Settings will find it once it is running.
              </span>
            </div>
          )}
        </Swap>
      </div>

      <footer className="onboard-foot">
        <button className="btn ghost" onClick={onBack}>
          Back
        </button>
        <button className="btn primary" onClick={save} disabled={busy || saved}>
          Continue
          <ArrowRight />
        </button>
      </footer>
    </>
  )
}
