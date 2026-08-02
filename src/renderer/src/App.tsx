import { useEffect, useState } from 'react'
import Agenda from './views/Agenda'
import Ajustes from './views/Ajustes'
import Carpetas from './views/Carpetas'
import Chat from './views/Chat'
import Tareas from './views/Tareas'

const VIEWS = [
  { id: 'chat', label: 'Chat', icon: '💬', component: Chat },
  { id: 'agenda', label: 'Agenda', icon: '📅', component: Agenda },
  { id: 'tareas', label: 'Tareas', icon: '📋', component: Tareas },
  { id: 'carpetas', label: 'Carpetas', icon: '🗂️', component: Carpetas },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️', component: Ajustes }
] as const

type ViewId = (typeof VIEWS)[number]['id']

export default function App(): JSX.Element {
  // Hasta saber si hay sesion no pintamos nada: abrir en Agenda y saltar a
  // Ajustes medio segundo despues se ve como un fallo.
  const [view, setView] = useState<ViewId | null>(null)

  useEffect(() => {
    void window.jarvis.auth.status().then((result) => {
      const connected = result.ok && result.data.connected
      setView(connected ? 'agenda' : 'ajustes')
    })
  }, [])

  if (view === null) return <div className="app-loading" />

  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[0]
  const Current = active.component

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">J A R V I S</div>
        {VIEWS.slice(0, 4).map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
        <div className="nav-spacer" />
        <button
          className={`nav-item ${view === 'ajustes' ? 'active' : ''}`}
          onClick={() => setView('ajustes')}
        >
          <span aria-hidden="true">⚙️</span>
          Ajustes
        </button>
      </nav>

      <main className="content">
        <Current />
      </main>
    </div>
  )
}
