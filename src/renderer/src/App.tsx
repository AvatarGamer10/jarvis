import { useEffect, useState } from 'react'
import type { SafeSettings } from '@shared/types'
import { SECTIONS, type SectionId } from './lib/sections'
import { sound } from './lib/sound'
import Agenda from './views/Agenda'
import Ajustes from './views/Ajustes'
import Carpetas from './views/Carpetas'
import Chat from './views/Chat'
import Hub from './views/Hub'
import Onboarding from './views/Onboarding'
import Tareas from './views/Tareas'

const COMPONENTS: Record<SectionId, () => JSX.Element> = {
  chat: Chat,
  agenda: Agenda,
  tareas: Tareas,
  carpetas: Carpetas,
  ajustes: Ajustes
}

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<SafeSettings | null>(null)
  const [ready, setReady] = useState(false)
  /** null = el menu radial. */
  const [section, setSection] = useState<SectionId | null>(null)
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

      // Sin cuenta conectada se entra directo a Ajustes: el anillo lleno de
      // secciones que aun no funcionan no ayuda a nadie.
      const connected = auth.ok && auth.data.connected
      setSection(connected ? null : 'ajustes')
      setReady(true)
    })()
  }, [])

  // Escape siempre devuelve al anillo. Es la unica tecla que hace falta
  // aprenderse, y se anuncia en la barra de cada seccion.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || section === null) return
      sound.play('nav')
      setSection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [section])

  const finishOnboarding = async (): Promise<void> => {
    const updated = await window.jarvis.settings.update({ onboardingDone: true })
    if (updated.ok) setSettings(updated.data)
  }

  const backToHub = (): void => {
    sound.play('nav')
    setSection(null)
  }

  if (!settings || !ready) return <div className="app-loading" />

  if (!settings.onboardingDone) return <Onboarding onDone={finishOnboarding} />

  if (section === null) {
    return (
      <div className="app">
        <Hub onOpen={setSection} />
      </div>
    )
  }

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]
  const Current = COMPONENTS[current.id]

  return (
    <div className="app">
      <header className="topbar">
        <button className="back-mark" onClick={backToHub}>
          {hasMark && <img src="./mark.png" alt="" onError={() => setHasMark(false)} />}
          <span>Menu</span>
        </button>

        <span className="topbar-title" style={{ color: current.color }}>
          {current.label}
        </span>

        <span className="topbar-hint">ESC</span>
      </header>

      <main className="content">
        {/* La key fuerza que la animacion de entrada se repita en cada cambio. */}
        <div className="view" key={current.id}>
          <Current />
        </div>
      </main>
    </div>
  )
}
