import { useEffect, useState } from 'react'
import type { SafeSettings } from '@shared/types'
import { sound } from './lib/sound'
import Agenda from './views/Agenda'
import Ajustes from './views/Ajustes'
import Carpetas from './views/Carpetas'
import Chat from './views/Chat'
import Onboarding from './views/Onboarding'
import Tareas from './views/Tareas'

const VIEWS = [
  { id: 'chat', label: 'Chat', icon: '◆', component: Chat },
  { id: 'agenda', label: 'Agenda', icon: '▦', component: Agenda },
  { id: 'tareas', label: 'Tareas', icon: '✓', component: Tareas },
  { id: 'carpetas', label: 'Carpetas', icon: '▤', component: Carpetas },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙', component: Ajustes }
] as const

type ViewId = (typeof VIEWS)[number]['id']

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<SafeSettings | null>(null)
  const [view, setView] = useState<ViewId | null>(null)
  const [hasMark, setHasMark] = useState(true)

  useEffect(() => {
    void (async () => {
      const [s, auth] = await Promise.all([
        window.jarvis.settings.get(),
        window.jarvis.auth.status()
      ])

      if (s.ok) {
        setSettings(s.data)
        sound.setEnabled(s.data.soundEnabled)
        document.documentElement.dataset.glass = s.data.glassEnabled ? 'on' : 'off'
      }

      // Sin sesion no tiene sentido abrir en Agenda: solo veria un error.
      const connected = auth.ok && auth.data.connected
      setView(connected ? 'agenda' : 'ajustes')
    })()
  }, [])

  const finishOnboarding = async (): Promise<void> => {
    const updated = await window.jarvis.settings.update({ onboardingDone: true })
    if (updated.ok) setSettings(updated.data)
  }

  const go = (id: ViewId): void => {
    if (id === view) return
    sound.play('nav')
    setView(id)
  }

  // Nada se pinta hasta saber que toca: abrir en una vista y saltar a otra
  // medio segundo despues se lee como un fallo, no como una carga.
  if (!settings || view === null) return <div className="app-loading" />

  if (!settings.onboardingDone) return <Onboarding onDone={finishOnboarding} />

  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[0]
  const Current = active.component

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand-row">
          {hasMark && (
            <img
              className="brand-logo"
              src="./mark.png"
              alt=""
              onError={() => setHasMark(false)}
            />
          )}
          <span className="brand">JARVIS</span>
        </div>

        {VIEWS.slice(0, 4).map((item, index) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            style={{ animationDelay: `${60 + index * 45}ms` }}
            onClick={() => go(item.id)}
          >
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        ))}

        <div className="nav-spacer" />

        <button
          className={`nav-item ${view === 'ajustes' ? 'active' : ''}`}
          onClick={() => go('ajustes')}
        >
          <span className="nav-icon" aria-hidden="true">
            ⚙
          </span>
          <span>Ajustes</span>
        </button>
      </nav>

      <main className="content">
        {/* La key fuerza que la animacion de entrada se repita en cada cambio. */}
        <div className="view" key={view}>
          <Current />
        </div>
      </main>
    </div>
  )
}
