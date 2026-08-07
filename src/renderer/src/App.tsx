import { useEffect, useState } from 'react'
import type { SafeSettings } from '@shared/types'
import Avisos from './components/Avisos'
import Novedades from './components/Novedades'
import Paleta from './components/Paleta'
import UpdateBanner from './components/UpdateBanner'
import { SECTIONS, type SectionId } from './lib/sections'
import { sound } from './lib/sound'
import Agenda from './views/Agenda'
import Ajustes from './views/Ajustes'
import Carpetas from './views/Carpetas'
import Chat from './views/Chat'
import Hub from './views/Hub'
import Notas from './views/Notas'
import Onboarding from './views/Onboarding'
import Tareas from './views/Tareas'
import Voz from './views/Voz'

/** Donde estabas la ultima vez. Se guarda el anillo tambien, como "ninguna". */
const CLAVE_SECCION = 'jarvis.seccion'

function seccionGuardada(): SectionId | null {
  const guardada = localStorage.getItem(CLAVE_SECCION)
  return SECTIONS.some((s) => s.id === guardada) ? (guardada as SectionId) : null
}

const COMPONENTS: Record<SectionId, () => JSX.Element> = {
  chat: Chat,
  voz: Voz,
  agenda: Agenda,
  tareas: Tareas,
  notas: Notas,
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
        document.documentElement.dataset.fondo = s.data.fondoIntensidad
      }

      // Sin cuenta conectada se entra directo a Ajustes: el anillo lleno de
      // secciones que aun no funcionan no ayuda a nadie.
      const connected = auth.ok && auth.data.connected
      // Se retoma donde lo dejaste. Quien cierra desde el anillo se lo vuelve a
      // encontrar, asi que no le quitamos la pantalla de inicio a nadie.
      setSection(connected ? seccionGuardada() : 'ajustes')
      setReady(true)
    })()
  }, [])

  useEffect(() => {
    if (!ready) return
    if (section === null) localStorage.removeItem(CLAVE_SECCION)
    else localStorage.setItem(CLAVE_SECCION, section)
  }, [section, ready])

  /**
   * Teclado.
   *
   * Escape vuelve al anillo, Ctrl+K abre la paleta y Ctrl+1..7 salta directo a
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

  // Lo que flota por encima de todo, incluida la bienvenida: cada uno en una
  // esquina, sin estorbar a lo que estes haciendo ni desplazar el contenido.
  const flotantes = (
    <>
      <UpdateBanner />
      <Avisos />
      {/* Solo sale cuando la version ha cambiado, y una unica vez. */}
      {settings.onboardingDone && <Novedades />}
    </>
  )

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
        {flotantes}
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
        {flotantes}
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
      {flotantes}
      {paletaComandos}
    </>
  )
}
