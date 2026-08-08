import { RotateCw, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AuthStatus, SafeSettings } from '@shared/types'
import CommandPalette from './components/CommandPalette'
import { startSpecularTracking } from './components/anim'
import { TOPBAR_SLOT } from './components/TopbarActions'
import Logo from './components/Logo'
import Toasts from './components/Toasts'
import UpdateBanner from './components/UpdateBanner'
import WhatsNew from './components/WhatsNew'
import { StateNotice } from './components/ui'
import { onAuthChanged, onNavigate } from './lib/app-events'
import { SECTIONS, sectionOf, type SectionId } from './lib/nav'
import { sound } from './lib/sound'
import {
  loadNeuralVoice,
  NEURAL_BUNDLE,
  neuralPreferred,
  neuralReady
} from './lib/neural-voice'
import { bundleForQuality, loadModel, modelReady, savedQuality } from './lib/stt'
import { tts } from './lib/tts'
import Chat from './views/Chat'
import Files from './views/Files'
import Grades from './views/Grades'
import Onboarding from './views/Onboarding'
import Schedule from './views/Schedule'
import Settings from './views/Settings'
import Tasks from './views/Tasks'
import Voice from './views/Voice'

/** Where you were last time. */
const LAST_SECTION = 'vilo.section'

function savedSection(): SectionId | null {
  const saved = localStorage.getItem(LAST_SECTION)
  return SECTIONS.some((section) => section.id === saved) ? (saved as SectionId) : null
}

const VIEWS: Record<SectionId, () => JSX.Element> = {
  voice: Voice,
  chat: Chat,
  schedule: Schedule,
  tasks: Tasks,
  grades: Grades,
  files: Files,
  settings: Settings
}

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<SafeSettings | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [ready, setReady] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)
  const [section, setSection] = useState<SectionId>('voice')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [due, setDue] = useState<{ today: number; overdue: number } | null>(null)

  const boot = useCallback(async (): Promise<void> => {
    setStartupError(null)
    const [loaded, status] = await Promise.all([
      window.vilo.settings.get(),
      window.vilo.auth.status()
    ])

    if (!loaded.ok) {
      setStartupError(loaded.error)
      setReady(true)
      return
    }

    setSettings(loaded.data)
    sound.setEnabled(loaded.data.soundEnabled)
    document.documentElement.dataset.glass = loaded.data.glassEnabled ? 'on' : 'off'
    if (status.ok) setAuth(status.data)

    // With no account connected there is nothing for the other screens to
    // show, so setup is where you land. Otherwise you pick up where you
    // left off.
    const connected = status.ok && status.data.connected
    setSection(connected ? (savedSection() ?? 'voice') : 'settings')
    setReady(true)
    tts.prepare()
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  /**
   * Warm installed voice engines after the first screen has painted.
   *
   * Both engines live in workers, so preparation cannot freeze navigation.
   * Status is checked first: startup must never silently begin a model
   * download, but verified files should be memory-ready before the first hold.
   */
  useEffect(() => {
    if (!ready || !settings?.onboardingDone) return

    let current = true
    const idle = window.requestIdleCallback(
      () => {
        void (async () => {
          const quality = savedQuality()
          const listening = await window.vilo.models.status(bundleForQuality(quality))
          if (current && listening.ok && listening.data.installed && !modelReady()) {
            void loadModel(undefined, quality).catch((error: unknown) => {
              console.error('[voice] listening warm-up failed:', error)
            })
          }

          if (!neuralPreferred() || neuralReady()) return
          const speaking = await window.vilo.models.status(NEURAL_BUNDLE)
          if (current && speaking.ok && speaking.data.installed) {
            void loadNeuralVoice().catch((error: unknown) => {
              console.error('[voice] natural voice warm-up failed:', error)
            })
          }
        })()
      },
      { timeout: 1_500 }
    )

    return () => {
      current = false
      window.cancelIdleCallback(idle)
    }
  }, [ready, settings?.onboardingDone])

  /*
   * Pointer light for every raised surface in the app.
   *
   * One listener at the document rather than a pair per button: buttons come
   * and go constantly here, and the alternative is a ref and two listeners on
   * each of them for what amounts to a highlight.
   */
  useEffect(() => startSpecularTracking(), [])

  const refreshAuth = useCallback(async (): Promise<void> => {
    const status = await window.vilo.auth.status()
    setAuth(status.ok ? status.data : { connected: false, email: null, error: status.error })
  }, [])

  useEffect(() => {
    const off = onAuthChanged(() => void refreshAuth())
    const onFocus = (): void => void refreshAuth()
    window.addEventListener('focus', onFocus)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshAuth])

  useEffect(() => {
    if (ready) localStorage.setItem(LAST_SECTION, section)
  }, [section, ready])

  /**
   * Counts for the rail.
   *
   * Every five minutes. Deadlines do not move by the second, and asking more
   * often would only spend battery.
   */
  useEffect(() => {
    if (!ready) return
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
  }, [ready])

  const go = useCallback((id: SectionId): void => {
    sound.play('nav')
    setPaletteOpen(false)
    setSection(id)
  }, [])

  useEffect(() => onNavigate(go), [go])

  /**
   * Keyboard.
   *
   * Cmd+K opens the palette, Cmd+1..7 jump straight to a section. Both are
   * ignored while a text field has focus only where they would collide —
   * the modifier combinations are safe everywhere, so they are not.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }

      if (/^[1-9]$/.test(event.key)) {
        const target = SECTIONS[Number(event.key) - 1]
        if (!target) return
        event.preventDefault()
        go(target.id)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const finishOnboarding = async (): Promise<void> => {
    const updated = await window.vilo.settings.update({ onboardingDone: true })
    if (updated.ok) setSettings(updated.data)
    const status = await window.vilo.auth.status()
    if (status.ok) setAuth(status.data)
    setSection(status.ok && status.data.connected ? 'voice' : 'settings')
    sound.play('start')
  }

  if (startupError) {
    return (
      <div className="boot boot-error">
        <StateNotice
          tone="error"
          title="Vilo could not open its settings"
          hint={startupError}
          action={
            <button className="btn" onClick={() => void boot()}>
              <RotateCw />
              Try again
            </button>
          }
        />
      </div>
    )
  }

  // Blank rather than a spinner: settings normally come back in a few
  // milliseconds, so showing a control for that long would only flash.
  if (!settings || !ready) return <div className="boot" />

  const floating = (
    <>
      <UpdateBanner />
      <Toasts />
      {/* Only appears when the version changed, and only once. */}
      {settings.onboardingDone && <WhatsNew />}
    </>
  )

  const palette = paletteOpen ? (
    <CommandPalette onGo={go} onClose={() => setPaletteOpen(false)} />
  ) : null

  if (!settings.onboardingDone) {
    return (
      <>
        <Onboarding onDone={finishOnboarding} />
        {floating}
        {palette}
      </>
    )
  }

  const current = sectionOf(section)
  const View = VIEWS[current.id]
  const pending = (due?.today ?? 0) + (due?.overdue ?? 0)
  const email = auth?.connected ? auth.email : null

  return (
    <>
      <div className="window">
        <aside className="rail">
          <div className="rail-top">
            <Logo size={22} className="rail-mark" opacity={0.94} />
            <span className="rail-name">Vilo</span>
          </div>

          <nav className="rail-nav">
            {SECTIONS.map((item) => {
              const Icon = item.icon
              const count = item.id === 'tasks' ? pending : 0
              return (
                <button
                  key={item.id}
                  className="nav-item"
                  aria-current={item.id === section ? 'page' : undefined}
                  onClick={() => go(item.id)}
                >
                  <Icon />
                  {item.label}
                  {count > 0 && (
                    <span className={`nav-count ${due?.overdue ? 'hot' : ''}`}>{count}</span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="rail-foot">
            <button className="rail-search" onClick={() => setPaletteOpen(true)}>
              <Search />
              Search
              <kbd>⌘K</kbd>
            </button>

            <button className="rail-account" onClick={() => go('settings')}>
              <span className={`avatar ${email ? '' : 'off'}`}>
                {email ? email.slice(0, 1) : '—'}
              </span>
              <span className="rail-account-text">
                <strong className="truncate">{email ? email.split('@')[0] : 'Not connected'}</strong>
                <span className="truncate">{email ? 'Google connected' : 'Open settings'}</span>
              </span>
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="topbar-title">
              <h1>{current.label}</h1>
              <p>{current.tagline}</p>
            </div>

            {/* Screens put their own window-level controls in here through a
                portal, so they do not have to carve a hole out of their own
                layout to hold them. See components/TopbarActions.tsx. */}
            <div className="topbar-actions" id={TOPBAR_SLOT} />
          </header>

          <div className="content">
            {/* The key restarts the entrance animation on every change. A
                screen that swaps without moving looks broken. */}
            <div className="view" key={current.id}>
              <View />
            </div>
          </div>
        </main>
      </div>
      {floating}
      {palette}
    </>
  )
}
