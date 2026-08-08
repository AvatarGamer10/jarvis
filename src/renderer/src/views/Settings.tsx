import {
  Check,
  Download,
  ExternalLink,
  KeyRound,
  RefreshCw,
  TriangleAlert,
  Upload
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AuthStatus, LlmProviderId, SafeSettings, Settings as AllSettings } from '@shared/types'
import { Reveal, Swap } from '../components/anim'
import VoiceOutputSetup from '../components/VoiceOutputSetup'
import { Field, StateNotice, SwitchRow } from '../components/ui'
import { notifyAuthChanged } from '../lib/app-events'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'
import { useAsync } from '../lib/useAsync'

/**
 * Everything Vilo can think with.
 *
 * Eight, and five of them are the same client behind different addresses —
 * see agent/providers/openai-compatible.ts. The list is ordered by how quickly
 * someone can get from here to a working assistant, which is not the same as
 * how good the models are: Ollama is free and private and it is second to
 * last, because it asks for several gigabytes before it does anything at all.
 *
 * No logos. Every one of these ships a wordmark in its own colours and its own
 * typeface, and eight of them side by side in a grey app looks like a sponsor
 * page. The name set in our own face is enough — the only mark on these cards
 * is the tick showing which one is chosen.
 */
const PROVIDERS: {
  id: LlmProviderId
  name: string
  blurb: string
}[] = [
  { id: 'openrouter', name: 'OpenRouter', blurb: 'One key, most models. Nothing to install.' },
  { id: 'openai', name: 'OpenAI', blurb: 'GPT models, straight from the source.' },
  { id: 'anthropic', name: 'Anthropic', blurb: 'Claude models, direct. Strong at following rules.' },
  { id: 'groq', name: 'Groq', blurb: 'Open models, answered almost instantly.' },
  { id: 'mistral', name: 'Mistral', blurb: 'European, and generous on the free tier.' },
  { id: 'gemini', name: 'Gemini', blurb: "Google's own API, with a free tier." },
  { id: 'ollama', name: 'Ollama', blurb: 'Runs on this Mac. Free and private, wants disk space.' },
  { id: 'custom', name: 'Your own server', blurb: 'Anything OpenAI-shaped — LM Studio, vLLM, a proxy.' }
]

const KEY_LINKS: Partial<Record<LlmProviderId, { url: string; label: string }>> = {
  openrouter: { url: 'https://openrouter.ai/keys', label: 'openrouter.ai/keys' },
  openai: { url: 'https://platform.openai.com/api-keys', label: 'platform.openai.com' },
  anthropic: { url: 'https://console.anthropic.com/settings/keys', label: 'console.anthropic.com' },
  groq: { url: 'https://console.groq.com/keys', label: 'console.groq.com/keys' },
  mistral: { url: 'https://console.mistral.ai/api-keys', label: 'console.mistral.ai' },
  gemini: { url: 'https://aistudio.google.com/apikey', label: 'aistudio.google.com' }
}

type HealthState = 'ready' | 'warning' | 'error'

interface HealthCheck {
  label: string
  detail: string
  state: HealthState
}

/**
 * Settings.
 *
 * One long column, not tabs — each section is short, and a single scroll means
 * you can find something you half-remember by looking rather than by guessing
 * which tab it was filed under.
 *
 * Two kinds of setting live here and they behave differently on purpose:
 * switches apply the moment you flip them, because they are instant and
 * reversible; anything typed into a field is held until Save, because
 * half-typed API keys should never be sent anywhere.
 */
export default function Settings(): JSX.Element {
  const state = useAsync<SafeSettings>(() => window.vilo.settings.get())
  const settings = state.data

  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [health, setHealth] = useState<HealthCheck[] | null>(null)

  // Form fields. Secrets start empty: if nothing is typed, nothing is sent and
  // the stored value stays exactly as it was.
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [provider, setProvider] = useState<LlmProviderId>('openrouter')
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [models, setModels] = useState<Record<string, string>>({})
  const [ollamaHost, setOllamaHost] = useState('http://127.0.0.1:11434')
  const [customBase, setCustomBase] = useState('')
  const [briefTime, setBriefTime] = useState('07:30')

  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null)
  const [remoteModels, setRemoteModels] = useState<{ id: string; name: string }[] | null>(null)

  useEffect(() => {
    if (!settings) return
    setClientId(settings.googleClientId)
    setProvider(settings.llmProvider)
    setModels({
      openrouter: settings.openrouterModel,
      openai: settings.openaiModel,
      anthropic: settings.anthropicModel,
      groq: settings.groqModel,
      mistral: settings.mistralModel,
      gemini: settings.geminiModel,
      ollama: settings.ollamaModel,
      custom: settings.customModel
    })
    setOllamaHost(settings.ollamaHost)
    setCustomBase(settings.customBaseUrl)
    setBriefTime(settings.dailyBriefTime)
  }, [settings])

  const detectOllama = async (): Promise<void> => {
    setOllamaModels(null)
    const result = await window.vilo.agent.ollamaModels()
    setOllamaModels(result.ok ? result.data : [])
  }

  const loadRemoteModels = async (id: LlmProviderId): Promise<void> => {
    setRemoteModels(null)
    const result = await window.vilo.agent.models(id)
    setRemoteModels(result.ok ? result.data : [])
  }

  useEffect(() => {
    if (provider === 'ollama') void detectOllama()
    else if (provider !== 'gemini') void loadRemoteModels(provider)
    else setRemoteModels([])
  }, [provider])

  const refreshStatus = async (): Promise<void> => {
    const result = await window.vilo.auth.status()
    setStatus(result.ok ? result.data : { connected: false, email: null, error: result.error })
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  /**
   * The health check.
   *
   * The model half is a real request now rather than a look at whether a key
   * is present — see agent:check. "You have typed something in the box" and
   * "this works" are different claims, and only one of them is worth a green
   * light on a settings screen.
   */
  const runChecks = async (): Promise<void> => {
    if (!settings || checking) return
    setChecking(true)

    const authResult = await window.vilo.auth.status()
    const google: AuthStatus = authResult.ok
      ? authResult.data
      : { connected: false, email: null, error: authResult.error }
    setStatus(google)

    const checks: HealthCheck[] = [
      {
        label: 'Google account',
        state: google.connected ? 'ready' : 'warning',
        detail: google.connected
          ? `Signed in${google.email ? ` as ${google.email}` : ''}`
          : (google.error ?? 'Not connected')
      }
    ]

    if (google.connected) {
      const now = new Date()
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      const [calendar, classroom] = await Promise.all([
        window.vilo.calendar.list(now.toISOString(), tomorrow.toISOString()),
        window.vilo.classroom.list(false)
      ])
      checks.push(
        {
          label: 'Google Calendar',
          state: calendar.ok ? 'ready' : 'error',
          detail: calendar.ok ? 'Available' : calendar.error
        },
        {
          label: 'Google Classroom',
          state: classroom.ok ? 'ready' : 'warning',
          detail: classroom.ok ? 'Available' : classroom.error
        }
      )
    } else {
      checks.push(
        { label: 'Google Calendar', state: 'warning', detail: 'Connect Google to enable it' },
        { label: 'Google Classroom', state: 'warning', detail: 'Connect Google to enable it' }
      )
    }

    const model = await window.vilo.agent.check()
    const active = PROVIDERS.find((p) => p.id === settings.llmProvider)
    checks.push({
      label: active?.name ?? 'The model',
      state: model.ok && model.data.ok ? 'ready' : 'error',
      detail: model.ok ? model.data.detail : model.error
    })

    setHealth(checks)
    setChecking(false)
  }

  const savedKeyFor = (id: LlmProviderId): boolean =>
    settings
      ? {
          openrouter: settings.hasOpenrouterApiKey,
          openai: settings.hasOpenaiApiKey,
          anthropic: settings.hasAnthropicApiKey,
          groq: settings.hasGroqApiKey,
          mistral: settings.hasMistralApiKey,
          gemini: settings.hasGeminiApiKey,
          custom: settings.hasCustomApiKey,
          ollama: true
        }[id]
      : false

  /** Something has been typed that has not been saved. */
  const dirty =
    settings !== null &&
    (clientId.trim() !== settings.googleClientId ||
      provider !== settings.llmProvider ||
      models.openrouter?.trim() !== settings.openrouterModel ||
      models.openai?.trim() !== settings.openaiModel ||
      models.anthropic?.trim() !== settings.anthropicModel ||
      models.groq?.trim() !== settings.groqModel ||
      models.mistral?.trim() !== settings.mistralModel ||
      models.gemini?.trim() !== settings.geminiModel ||
      models.ollama?.trim() !== settings.ollamaModel ||
      models.custom?.trim() !== settings.customModel ||
      ollamaHost.trim() !== settings.ollamaHost ||
      customBase.trim() !== settings.customBaseUrl ||
      briefTime !== settings.dailyBriefTime ||
      clientSecret.trim() !== '' ||
      Object.values(keys).some((value) => value.trim() !== ''))

  const save = async (): Promise<void> => {
    setBusy(true)
    const patch: Record<string, string> = {
      googleClientId: clientId.trim(),
      llmProvider: provider,
      openrouterModel: models.openrouter?.trim() ?? '',
      openaiModel: models.openai?.trim() ?? '',
      anthropicModel: models.anthropic?.trim() ?? '',
      groqModel: models.groq?.trim() ?? '',
      mistralModel: models.mistral?.trim() ?? '',
      geminiModel: models.gemini?.trim() ?? '',
      ollamaModel: models.ollama?.trim() ?? '',
      customModel: models.custom?.trim() ?? '',
      ollamaHost: ollamaHost.trim(),
      customBaseUrl: customBase.trim(),
      dailyBriefTime: briefTime
    }
    if (clientSecret.trim()) patch.googleClientSecret = clientSecret.trim()
    for (const [id, value] of Object.entries(keys)) {
      if (value.trim()) patch[`${id}ApiKey`] = value.trim()
    }

    const result = await window.vilo.settings.update(patch)
    if (result.ok) {
      setClientSecret('')
      setKeys({})
      toast.show('Settings saved')
      state.reload()
      setHealth(null)
    } else {
      toast.error(result.error)
    }
    setBusy(false)
  }

  /** Switches apply immediately — they are instant and reversible. */
  const patch = async (changes: Partial<AllSettings>): Promise<void> => {
    const updated = await window.vilo.settings.update(changes)
    if (updated.ok) state.reload()
    else toast.error(updated.error)
  }

  const useBundledCredentials = async (): Promise<void> => {
    setBusy(true)
    await patch({ googleClientId: '', googleClientSecret: '' })
    setClientId('')
    setClientSecret('')
    toast.show('Using the built-in credentials')
    setBusy(false)
  }

  const setGlass = async (on: boolean): Promise<void> => {
    document.documentElement.dataset.glass = on ? 'on' : 'off'
    await patch({ glassEnabled: on })
  }

  const setSounds = async (on: boolean): Promise<void> => {
    sound.setEnabled(on)
    // You hear the one you just enabled: the response to the setting is the
    // setting.
    if (on) sound.play('confirm')
    await patch({ soundEnabled: on })
  }

  const connect = async (): Promise<void> => {
    setBusy(true)
    const result = await window.vilo.auth.signIn()
    if (result.ok) {
      setStatus(result.data)
      notifyAuthChanged()
      toast.show(`Connected as ${result.data.email ?? 'your account'}`)
    } else {
      toast.error(result.error)
    }
    setBusy(false)
  }

  const disconnect = async (): Promise<void> => {
    setBusy(true)
    await window.vilo.auth.signOut()
    await refreshStatus()
    notifyAuthChanged()
    setHealth(null)
    toast.show('Signed out')
    setBusy(false)
  }

  const importGoogleJson = async (): Promise<void> => {
    setBusy(true)
    const result = await window.vilo.dialog.importGoogleJson()
    if (result.ok) {
      // null means the dialog was closed, which is not an error.
      if (result.data) {
        toast.show('Credentials imported')
        state.reload()
      }
    } else {
      toast.error(result.error)
    }
    setBusy(false)
  }

  const exportData = async (): Promise<void> => {
    setBusy(true)
    const result = await window.vilo.data.exportData()
    if (!result.ok) toast.error(result.error)
    else if (result.data) toast.show(`Backup saved to ${result.data.path}`)
    setBusy(false)
  }

  const importData = async (): Promise<void> => {
    setBusy(true)
    const result = await window.vilo.data.importData()
    if (!result.ok) toast.error(result.error)
    else if (result.data) {
      toast.show(`Restored ${result.data.files} file(s). Restart Vilo to see them.`)
    }
    setBusy(false)
  }

  const openLink = (url: string): void => {
    void window.vilo.shell.openExternal(url)
  }

  if (state.error) {
    return (
      <div className="view" style={{ display: 'grid', placeItems: 'center' }}>
        <StateNotice
          tone="error"
          title="Settings could not be loaded"
          hint={state.error}
          action={
            <button className="btn" onClick={state.reload}>
              <RefreshCw />
              Try again
            </button>
          }
        />
      </div>
    )
  }

  if (state.loading || !settings) {
    return (
      <div className="view settings">
        <div className="skeleton" style={{ height: 82 }} />
        <div className="skeleton" style={{ height: 140 }} />
        <div className="skeleton" style={{ height: 96 }} />
      </div>
    )
  }

  const active = PROVIDERS.find((p) => p.id === settings.llmProvider)
  const modelHealth = health?.at(-1)
  const link = KEY_LINKS[provider]

  return (
    <div className="view scroll">
      <div className="settings">
        {/* --- Account ------------------------------------------------- */}
        <Reveal as="section" className="settings-section">
          <header>
            <h2>Google account</h2>
            <p>Vilo reads your calendar and Classroom. It never posts anything.</p>
          </header>

          <div className="card account-card specular">
            <span className={`status-dot ${status?.connected ? 'on' : ''}`} />
            <div className="grow">
              <div className="item-title">
                {status === null ? 'Checking…' : status.connected ? status.email : 'Not connected'}
              </div>
              <div className="item-sub">
                {status === null
                  ? 'Reading the saved session'
                  : status.connected
                    ? 'Calendar and Classroom are available'
                    : (status.error ?? 'Sign in to see your week and your homework')}
              </div>
            </div>

            {status?.connected ? (
              <button className="btn" onClick={disconnect} disabled={busy}>
                Sign out
              </button>
            ) : (
              <button
                className="btn primary"
                onClick={connect}
                disabled={busy || !settings.canConnect}
              >
                Connect
              </button>
            )}
          </div>

          {!settings.canConnect && (
            <div className="alert">
              <KeyRound />
              <span>
                This build ships without Google credentials, so there is nothing to connect to yet.
                Set up your own project below.
              </span>
            </div>
          )}

          {/* Almost nobody needs this — only people running their own Google
              Cloud project. Folded away rather than competing with the button. */}
          <details>
            <summary className="link" style={{ cursor: 'pointer' }}>
              Use my own Google Cloud project
            </summary>

            <div className="col" style={{ gap: 'var(--s-4)', marginTop: 'var(--s-4)' }}>
              <p className="meta">
                {settings.usesOwnCredentials
                  ? 'Vilo is currently using your credentials.'
                  : 'Vilo is currently using the credentials it shipped with.'}
              </p>

              <div className="row">
                <button className="btn sm" onClick={importGoogleJson} disabled={busy}>
                  <Upload />
                  Import client_secret.json…
                </button>
                {settings.usesOwnCredentials && (
                  <button className="btn sm" disabled={busy} onClick={useBundledCredentials}>
                    Go back to the built-in ones
                  </button>
                )}
              </div>

              <Field label="Client ID">
                <input
                  className="input"
                  type="text"
                  value={clientId}
                  placeholder="000000000000-xxxx.apps.googleusercontent.com"
                  onChange={(event) => setClientId(event.target.value)}
                />
              </Field>

              <Field
                label="Client secret"
                hint="Encrypted with the system keychain. Leave blank to keep the current one."
              >
                <input
                  className="input"
                  type="password"
                  value={clientSecret}
                  placeholder={settings.hasGoogleClientSecret ? '•••••••• saved' : 'Not set'}
                  onChange={(event) => setClientSecret(event.target.value)}
                />
              </Field>
            </div>
          </details>
        </Reveal>

        {/* --- Model ---------------------------------------------------- */}
        <Reveal as="section" className="settings-section" delay={0.05}>
          <header>
            <h2>The model</h2>
            <p>What Vilo thinks with. Switching takes effect immediately, no restart.</p>
          </header>

          {/* The state of the thing as it is actually saved, before any of the
              boxes below. Which one is live and whether it answers are the two
              questions this screen exists to settle. */}
          <div className="active-model card specular">
            <span
              className="status-dot"
              data-state={modelHealth?.state ?? (savedKeyFor(settings.llmProvider) ? 'idle' : 'off')}
            />
            <div className="grow">
              <div className="item-title">{active?.name ?? settings.llmProvider}</div>
              <div className="item-sub truncate">
                {modelHealth
                  ? modelHealth.detail
                  : savedKeyFor(settings.llmProvider)
                    ? `${currentModelOf(settings)} · not tested yet`
                    : 'No API key saved yet'}
              </div>
            </div>
          </div>

          <div className="provider-grid">
            {PROVIDERS.map((option) => (
              <button
                key={option.id}
                className="provider specular"
                aria-pressed={provider === option.id}
                onClick={() => setProvider(option.id)}
              >
                <strong>{option.name}</strong>
                <span>{option.blurb}</span>
              </button>
            ))}
          </div>

          {/* Swaps its height rather than jumping, so the sections underneath
              stay where they were when you change your mind about a provider. */}
          <Swap swapKey={provider}>
            <div className="card col" style={{ gap: 'var(--s-4)' }}>
              {provider === 'custom' && (
                <Field
                  label="Server address"
                  hint="Include the version path — LM Studio's is http://127.0.0.1:1234/v1."
                >
                  <input
                    className="input"
                    type="text"
                    value={customBase}
                    placeholder="http://127.0.0.1:1234/v1"
                    onChange={(event) => setCustomBase(event.target.value)}
                  />
                </Field>
              )}

              {provider === 'ollama' && (
                <Field label="Where Ollama is listening">
                  <input
                    className="input"
                    type="text"
                    value={ollamaHost}
                    onChange={(event) => setOllamaHost(event.target.value)}
                  />
                </Field>
              )}

              {provider !== 'ollama' && (
                <Field
                  label="API key"
                  hint={
                    link ? (
                      <>
                        Create one at{' '}
                        <button className="link" onClick={() => openLink(link.url)}>
                          {link.label}
                        </button>
                        . Stored in the system keychain, never in plain text.
                      </>
                    ) : (
                      'Leave blank if your server does not need one.'
                    )
                  }
                >
                  <input
                    className="input"
                    type="password"
                    value={keys[provider] ?? ''}
                    placeholder={savedKeyFor(provider) ? '•••••••• saved' : 'Not set'}
                    onChange={(event) =>
                      setKeys((current) => ({ ...current, [provider]: event.target.value }))
                    }
                  />
                </Field>
              )}

              <Field
                label="Model"
                hint={
                  provider === 'openrouter'
                    ? 'Only models that support tool calling are listed — running tools is Vilo’s whole job.'
                    : 'It has to support tool calling. Most current models do.'
                }
              >
                <input
                  className="input"
                  type="text"
                  value={models[provider] ?? ''}
                  placeholder={PLACEHOLDER[provider]}
                  list="model-suggestions"
                  onChange={(event) =>
                    setModels((current) => ({ ...current, [provider]: event.target.value }))
                  }
                />
                <datalist id="model-suggestions">
                  {(provider === 'ollama'
                    ? (ollamaModels ?? []).map((id) => ({ id, name: id }))
                    : (remoteModels ?? [])
                  ).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </datalist>
              </Field>

              <ModelSource
                provider={provider}
                ollamaModels={ollamaModels}
                remoteModels={remoteModels}
                onPickOllama={(name) => setModels((c) => ({ ...c, ollama: name }))}
                onRefresh={() =>
                  provider === 'ollama' ? void detectOllama() : void loadRemoteModels(provider)
                }
                onBrowse={() => openLink('https://openrouter.ai/models?supported_parameters=tools')}
              />

              {/* The test sits with the key and the model id, because those are
                  the two things it is testing. It was up beside the status
                  row, which meant filling in a key and then hunting back up
                  the page to find out whether it worked. */}
              <div className="row wrap model-test">
                <button
                  className="btn sm"
                  onClick={() => void runChecks()}
                  disabled={checking || dirty}
                >
                  {checking ? <span className="spinner" /> : <RefreshCw />}
                  {checking ? 'Testing' : 'Test this key'}
                </button>
                <span className="meta">
                  {dirty
                    ? 'Save first — the test uses what is stored.'
                    : 'Sends one short request to check the key, the model and the connection.'}
                </span>
              </div>
            </div>
          </Swap>
        </Reveal>

        {/* --- Voice ---------------------------------------------------- */}
        <Reveal as="section" className="settings-section" delay={0.1}>
          <header>
            <h2>Voice</h2>
            <p>How Vilo sounds when it reads an answer out loud.</p>
          </header>
          <VoiceOutputSetup mode="settings" />
        </Reveal>

        {/* --- Health --------------------------------------------------- */}
        {health && (
          <section className="settings-section">
            <header>
              <h2>Last check</h2>
            </header>
            <div className="health-list">
              {health.map((check) => (
                <div className="health-row" key={check.label} data-state={check.state}>
                  {check.state === 'ready' ? <Check /> : <TriangleAlert />}
                  <strong>{check.label}</strong>
                  <span className="truncate">{check.detail}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* --- Daily brief ---------------------------------------------- */}
        <Reveal as="section" className="settings-section" delay={0.14}>
          <header>
            <h2>Morning brief</h2>
            <p>
              Closing the window leaves Vilo in the menu bar so it can still reach you at the right
              time. Quit properly from there.
            </p>
          </header>

          <div className="card" style={{ padding: '0 var(--s-5)' }}>
            <SwitchRow
              title="Notify me each morning"
              hint="What is due today, what is late, and what is on your calendar."
              checked={settings.dailyBriefEnabled}
              onChange={(next) => void patch({ dailyBriefEnabled: next })}
            />
            <div className="switch-row">
              <span className="switch-text">
                <strong>Time</strong>
                <span>When the notification appears.</span>
              </span>
              <input
                className="input"
                type="time"
                style={{ width: 118 }}
                value={briefTime}
                onChange={(event) => setBriefTime(event.target.value)}
              />
            </div>
            <SwitchRow
              title="Start Vilo at login"
              hint="Needed for the brief to fire on days you have not opened it yourself."
              checked={settings.startAtLogin}
              onChange={(next) => void patch({ startAtLogin: next })}
            />
            <SwitchRow
              title="Floating orb"
              hint="A small always-on-top button you can talk to without leaving what you are doing. ⌃⌥J toggles it."
              checked={settings.hudVisible}
              onChange={() => void window.vilo.hud.toggle().then(() => state.reload())}
            />
          </div>
        </Reveal>

        {/* --- Appearance ------------------------------------------------ */}
        <Reveal as="section" className="settings-section" delay={0.18}>
          <header>
            <h2>Appearance</h2>
          </header>

          <div className="card" style={{ padding: '0 var(--s-5)' }}>
            <SwitchRow
              title="Translucent window"
              hint="Lets the desktop show through behind Vilo."
              checked={settings.glassEnabled}
              onChange={(next) => void setGlass(next)}
            />
            <SwitchRow
              title="Sounds"
              hint="Short cues when something is confirmed, cancelled or completed."
              checked={settings.soundEnabled}
              onChange={(next) => void setSounds(next)}
            />
            <div className="switch-row">
              <span className="switch-text">
                <strong>Welcome screen</strong>
                <span>Show the introduction again next time Vilo opens.</span>
              </span>
              <button
                className="btn sm"
                onClick={() =>
                  void window.vilo.settings
                    .update({ onboardingDone: false })
                    .then(() => toast.show('You will see it next time Vilo opens'))
                }
              >
                Replay
              </button>
            </div>
          </div>
        </Reveal>

        {/* --- Data ------------------------------------------------------ */}
        <Reveal as="section" className="settings-section" delay={0.22}>
          <header>
            <h2>Your data</h2>
            <p>
              Vilo already keeps a daily backup of the last 14 days beside its own files. Exporting
              is for moving to another computer.
            </p>
          </header>

          <div className="card" style={{ padding: '0 var(--s-5)' }}>
            <div className="switch-row">
              <span className="switch-text">
                <strong>Save a copy</strong>
                <span>Tasks, exams, folder rules and the conversation, in one file.</span>
              </span>
              <button className="btn sm" onClick={exportData} disabled={busy}>
                <Download />
                Export
              </button>
            </div>
            <div className="switch-row">
              <span className="switch-text">
                <strong>Restore from a copy</strong>
                <span>Replaces what is here now. Needs a restart afterwards.</span>
              </span>
              <button className="btn sm" onClick={importData} disabled={busy}>
                <Upload />
                Import
              </button>
            </div>
          </div>
        </Reveal>

        <DangerZone
          onReloaded={() => {
            state.reload()
            void refreshStatus()
            notifyAuthChanged()
            setHealth(null)
          }}
        />

        <About />
      </div>

      {/*
       * The save bar.
       *
       * It used to reuse the toast container, which is fixed *and* has
       * pointer-events turned off — so it landed on top of the page and its
       * button could not be clicked. This is its own thing, pinned to the
       * viewport, and the column above reserves room for it so it never covers
       * the last row of whatever you were editing.
       */}
      {dirty && (
        <div className="save-bar" role="status">
          <span>Unsaved changes</span>
          <button className="btn primary sm" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

const PLACEHOLDER: Record<LlmProviderId, string> = {
  openrouter: 'anthropic/claude-3.5-haiku',
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-3-5-haiku-latest',
  groq: 'llama-3.3-70b-versatile',
  mistral: 'mistral-small-latest',
  gemini: 'gemini-2.5-flash',
  ollama: 'llama3.1:8b',
  custom: 'the id your server uses'
}

function currentModelOf(settings: SafeSettings): string {
  return (
    {
      openrouter: settings.openrouterModel,
      openai: settings.openaiModel,
      anthropic: settings.anthropicModel,
      groq: settings.groqModel,
      mistral: settings.mistralModel,
      gemini: settings.geminiModel,
      ollama: settings.ollamaModel,
      custom: settings.customModel
    }[settings.llmProvider] || 'no model chosen'
  )
}

/** The line under the model field: where the suggestions came from. */
function ModelSource({
  provider,
  ollamaModels,
  remoteModels,
  onPickOllama,
  onRefresh,
  onBrowse
}: {
  provider: LlmProviderId
  ollamaModels: string[] | null
  remoteModels: { id: string; name: string }[] | null
  onPickOllama: (name: string) => void
  onRefresh: () => void
  onBrowse: () => void
}): JSX.Element | null {
  if (provider === 'gemini') return null

  if (provider === 'ollama') {
    if (ollamaModels === null) return <span className="meta">Looking for Ollama…</span>
    if (ollamaModels.length === 0) {
      return (
        <div className="row wrap">
          <span className="meta">Nothing answered at that address. Check that Ollama is running.</span>
          <button className="btn ghost sm" onClick={onRefresh}>
            <RefreshCw />
            Look again
          </button>
        </div>
      )
    }
    return (
      <div className="col" style={{ gap: 6 }}>
        <span className="field-label">Models you already have</span>
        <div className="row wrap">
          {ollamaModels.map((name) => (
            <button key={name} className="chip" onClick={() => onPickOllama(name)}>
              {name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (remoteModels === null) return <span className="meta">Loading the model list…</span>

  if (remoteModels.length === 0) {
    return (
      <div className="row wrap">
        <span className="meta">
          No list yet — save an API key and it will fill in. You can always type an id by hand.
        </span>
        <button className="btn ghost sm" onClick={onRefresh}>
          <RefreshCw />
          Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="row wrap">
      <span className="meta">{remoteModels.length} models available.</span>
      <button className="btn ghost sm" onClick={onRefresh}>
        <RefreshCw />
        Refresh
      </button>
      {provider === 'openrouter' && (
        <button className="btn ghost sm" onClick={onBrowse}>
          <ExternalLink />
          Browse them
        </button>
      )}
    </div>
  )
}

/**
 * The irreversible corner.
 *
 * Kept at the bottom, visually apart, and every button asks a second time.
 * Grey rather than red, like everything else in Vilo — the confirmation is
 * what makes it safe, not the colour.
 */
function DangerZone({ onReloaded }: { onReloaded: () => void }): JSX.Element {
  const [armed, setArmed] = useState<string | null>(null)

  const run = async (id: string, action: () => Promise<unknown>, done: string): Promise<void> => {
    if (armed !== id) {
      setArmed(id)
      window.setTimeout(() => setArmed((current) => (current === id ? null : current)), 4000)
      return
    }
    setArmed(null)
    await action()
    toast.show(done)
    onReloaded()
  }

  const label = (id: string, normal: string): string => (armed === id ? 'Really?' : normal)

  return (
    <Reveal as="section" className="settings-section danger" delay={0.26}>
      <header>
        <h2>Danger zone</h2>
        <p>None of these can be undone. Each one asks twice.</p>
      </header>

      <div className="card" style={{ padding: '0 var(--s-5)' }}>
        <div className="switch-row">
          <span className="switch-text">
            <strong>Erase the conversation</strong>
            <span>Vilo forgets everything you have talked about. Your data stays.</span>
          </span>
          <button
            className="btn sm danger"
            data-armed={armed === 'chat'}
            onClick={() =>
              void run('chat', () => window.vilo.agent.reset(), 'The conversation is gone')
            }
          >
            {label('chat', 'Erase')}
          </button>
        </div>

        <div className="switch-row">
          <span className="switch-text">
            <strong>Forget every API key</strong>
            <span>Removes all saved keys from the keychain. Vilo stops answering until you add one.</span>
          </span>
          <button
            className="btn sm danger"
            data-armed={armed === 'keys'}
            onClick={() =>
              void run(
                'keys',
                () =>
                  window.vilo.settings.update({
                    openrouterApiKey: '',
                    openaiApiKey: '',
                    groqApiKey: '',
                    geminiApiKey: '',
                    customApiKey: ''
                  }),
                'All keys forgotten'
              )
            }
          >
            {label('keys', 'Forget')}
          </button>
        </div>

        <div className="switch-row">
          <span className="switch-text">
            <strong>Reset Vilo</strong>
            <span>
              Every setting back to new, every credential deleted, and signed out of Google. Your
              tasks, exams and folder rules are untouched.
            </span>
          </span>
          <button
            className="btn sm danger"
            data-armed={armed === 'all'}
            onClick={() =>
              void run('all', () => window.vilo.settings.reset(), 'Vilo has been reset')
            }
          >
            {label('all', 'Reset')}
          </button>
        </div>
      </div>
    </Reveal>
  )
}

/**
 * The foot of the page.
 *
 * Version, who made it, and where the updates are — which is also where the
 * update progress lives now. It used to be a floating panel in the top right
 * corner of every screen, which is an odd place to put a thing nobody asked
 * for and cannot act on until it finishes.
 */
function About(): JSX.Element {
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<string | null>(null)

  useEffect(() => {
    void window.vilo.app.version().then((result) => {
      if (result.ok) setVersion(result.data)
    })
    return window.vilo.updater.onState((state) => {
      if (state.phase === 'downloading') setUpdate(`Downloading ${state.version} · ${state.percent}%`)
      else if (state.phase === 'ready') setUpdate(`Version ${state.version} is ready to install`)
      else if (state.phase === 'none') setUpdate('You are up to date')
      else if (state.phase === 'checking') setUpdate('Checking…')
      else setUpdate(null)
    })
  }, [])

  return (
    <footer className="about">
      <div className="about-line">
        <strong>Vilo</strong>
        <span className="mono">{version ? `v${version}` : ''}</span>
      </div>
      <p>
        Made by <strong>Enzoreael</strong> and <strong>Noox</strong>.
      </p>
      {update && <p className="meta">{update}</p>}
      <div className="row wrap">
        <button className="btn ghost sm" onClick={() => void window.vilo.updater.check()}>
          <RefreshCw />
          Check for updates
        </button>
      </div>
    </footer>
  )
}
