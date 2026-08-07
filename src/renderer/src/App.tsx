import { useEffect, useState } from 'react'
import type { SafeSettings } from '@shared/types'
import Paleta from './components/Paleta'
import UpdateBanner from './components/UpdateBanner'
import { SECTIONS, type SectionId } from './lib/sections'
import { sound } from './lib/sound'
import Agenda from './views/Agenda'
import Ajustes from './views/Ajustes'
import Carpetas from './views/Carpetas'
import Chat from './views/Chat'
import Hub from './views/Hub'
import Onboarding from './views/Onboarding'
import Tareas from './views/Tareas'
import Voz from './views/Voz'

const COMPONENTS: Record<SectionId, () => JSX.Element> = {
  chat: Chat,
  voz: Voz,
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
  const [hayLogo, setHayLogo] = useState(true)
  const [paleta, setPaleta] = useState(false)

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

  /**
   * Teclado.
   *
   * Escape vuelve al anillo, Ctrl+K abre la paleta y Ctrl+1..6 salta directo a
   * cada seccion. El anillo sigue siendo la pantalla de inicio, pero quien ya
   * sabe adonde va no tiene que pasar por el.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const enCampo =
        (event.target as HTMLElement)?.tagName === 'INPUT' ||
        (event.target as HTMLElement)?.tagName === 'TEXTAREA'

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaleta((abierta) => !abierta)
        return
      }

      if ((event.ctrlKey || event.metaKey) && /^[1-9]$/.test(event.key)) {
        const destino = SECTIONS[Number(event.key) - 1]
        if (!destino) return
        event.preventDefault()
        sound.play('nav')
        setPaleta(false)
        setSection(destino.id)
        return
      }

      // Escape no se captura dentro de un campo: ahi puede querer decir
      // "descarta lo que estoy escribiendo".
      if (event.key === 'Escape' && !enCampo && !paleta && section !== null) {
        sound.play('nav')
        setSection(null)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [section, paleta])

  const finishOnboarding = async (): Promise<void> => {
    const updated = await window.jarvis.settings.update({ onboardingDone: true })
    if (updated.ok) setSettings(updated.data)
  }

  const backToHub = (): void => {
    sound.play('nav')
    setSection(null)
  }

  if (!settings || !ready) return <div className="app-loading" />

  // Si el fichero no existe, el navegador no pinta nada y no se rompe nada.
  const fondo = <div className="app-fondo" style={{ backgroundImage: "url('./fondo.png')" }} />

  // El aviso de actualizacion va por encima de todo, incluida la bienvenida:
  // flota en una esquina y no estorba a lo que estes haciendo.
  const actualizacion = <UpdateBanner />

  const paletaComandos = paleta ? (
    <Paleta
      onIrA={(id) => setSection(id)}
      onCerrar={() => setPaleta(false)}
    />
  ) : null

  if (!settings.onboardingDone) {
    return (
      <>
        {fondo}
        <Onboarding onDone={finishOnboarding} />
        {actualizacion}
        {paletaComandos}
      </>
    )
  }

  if (section === null) {
    return (
      <>
        {fondo}
        <div className="app">
          <Hub onOpen={setSection} />
        </div>
        {actualizacion}
        {paletaComandos}
      </>
    )
  }

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]
  const Current = COMPONENTS[current.id]

  return (
    <>
      {fondo}
      <div className="app">
        <header className="topbar">
          <button className="back-mark" onClick={backToHub}>
            {hayLogo && <img src="./logo.png" alt="" onError={() => setHayLogo(false)} />}
            <span>Menu</span>
          </button>

          <span className="topbar-title" style={{ color: current.color }}>
            {current.label}
          </span>

            <span className="topbar-hint">
            <kbd>Esc</kbd> menu · <kbd>Ctrl</kbd>+<kbd>K</kbd> buscar
          </span>
        </header>

        <main className="content">
          {/* La key fuerza que la animacion de entrada se repita en cada cambio. */}
          <div className="view" key={current.id}>
            <Current />
          </div>
        </main>
      </div>
      {actualizacion}
      {paletaComandos}
    </>
  )
}
