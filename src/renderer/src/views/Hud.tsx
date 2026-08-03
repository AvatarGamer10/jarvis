import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@shared/types'
import { BANDAS, grabar, MicrofonoNoDisponible, type Grabacion } from '../lib/microfono'
import { cargarModelo, modeloListo, transcribir } from '../lib/transcripcion'
import { tts } from '../lib/tts'

type Fase = 'reposo' | 'escuchando' | 'transcribiendo' | 'pensando' | 'hablando' | 'error'

/** Pixeles que hay que mover el raton para que cuente como arrastrar y no clic. */
const UMBRAL_ARRASTRE = 4

/**
 * Boton flotante siempre encima.
 *
 * Es deliberadamente pequeno: su razon de ser es estar al lado mientras usas
 * otra cosa, y un panel que ocupa sitio de verdad acaba estorbando y
 * cerrandose. Solo crece mientras tiene algo que ensenar.
 *
 * La conversacion ocurre aqui dentro: si abriera la ventana grande, romperia
 * justo lo que viene a evitar.
 */
export default function Hud(): JSX.Element {
  const [fase, setFase] = useState<Fase>('reposo')
  const [dicho, setDicho] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [barras, setBarras] = useState<number[]>(() => new Array(BANDAS).fill(0))

  const grabacion = useRef<Grabacion | null>(null)
  const animacion = useRef<number | null>(null)
  const arrastre = useRef<{ x: number; y: number; movido: boolean } | null>(null)

  const abierto = fase !== 'reposo'

  useEffect(() => {
    tts.preparar()
    return () => {
      grabacion.current?.cancelar()
      tts.callar()
      if (animacion.current) cancelAnimationFrame(animacion.current)
    }
  }, [])

  // La ventana crece y encoge desde el proceso principal, que es quien puede
  // cambiar su tamano real.
  useEffect(() => {
    void window.jarvis.hud.expand(abierto)
  }, [abierto])

  const fallar = (texto: string): void => {
    setMensaje(texto)
    setFase('error')
    // Se recoge solo: un HUD que se queda grande con un error es peor que uno
    // que no dice nada.
    setTimeout(() => setFase('reposo'), 4000)
  }

  const empezar = async (): Promise<void> => {
    setDicho('')
    setRespuesta('')
    setMensaje('')
    tts.callar()

    if (!modeloListo()) {
      setFase('transcribiendo')
      setMensaje('Preparando la voz…')
      try {
        await cargarModelo()
      } catch {
        fallar('Falta el modelo de voz. Abre JARVIS para descargarlo.')
        return
      }
    }

    try {
      grabacion.current = await grabar()
    } catch (err) {
      fallar(err instanceof MicrofonoNoDisponible ? err.message : 'No se pudo abrir el microfono.')
      return
    }

    setMensaje('')
    setFase('escuchando')

    const medir = (): void => {
      if (!grabacion.current) return
      setBarras(grabacion.current.bandas())
      animacion.current = requestAnimationFrame(medir)
    }
    medir()
  }

  const terminar = async (): Promise<void> => {
    if (!grabacion.current) return

    if (animacion.current) cancelAnimationFrame(animacion.current)
    setBarras(new Array(BANDAS).fill(0))
    setFase('transcribiendo')

    let texto = ''
    try {
      const audio = await grabacion.current.detener()
      grabacion.current = null
      texto = await transcribir(audio)
    } catch {
      fallar('No he podido entender el audio.')
      return
    }

    if (!texto) {
      fallar('No he oido nada.')
      return
    }

    setDicho(texto)
    setFase('pensando')

    const resultado = await window.jarvis.agent.send(texto)
    if (!resultado.ok) {
      fallar(resultado.error)
      return
    }

    const contestacion = ultimaRespuesta(resultado.data)
    setRespuesta(contestacion)
    setFase('hablando')
    tts.hablar(contestacion, () => setFase('reposo'))
  }

  // --- Arrastrar o pulsar ---------------------------------------------------
  //
  // Mantener pulsado no puede ser a la vez "hablar" y "mover", asi que aqui se
  // decide por el gesto: si el raton se desplaza, es arrastrar; si no, es un
  // clic que activa el microfono.

  const alPulsar = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    arrastre.current = { x: e.screenX, y: e.screenY, movido: false }

    const alMover = (m: MouseEvent): void => {
      if (!arrastre.current) return
      const dx = m.screenX - arrastre.current.x
      const dy = m.screenY - arrastre.current.y

      if (!arrastre.current.movido && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return

      arrastre.current.movido = true
      arrastre.current.x = m.screenX
      arrastre.current.y = m.screenY
      void window.jarvis.hud.move(dx, dy)
    }

    const alSoltar = (): void => {
      window.removeEventListener('mousemove', alMover)
      window.removeEventListener('mouseup', alSoltar)

      const eraClic = arrastre.current?.movido === false
      arrastre.current = null
      if (!eraClic) return

      if (fase === 'escuchando') void terminar()
      else if (fase === 'reposo' || fase === 'error') void empezar()
      else if (fase === 'hablando') {
        tts.callar()
        setFase('reposo')
      }
    }

    window.addEventListener('mousemove', alMover)
    window.addEventListener('mouseup', alSoltar)
  }

  const pista =
    fase === 'escuchando'
      ? 'Pulsa para terminar'
      : fase === 'hablando'
        ? 'Pulsa para callar'
        : fase === 'pensando'
          ? 'Pensando…'
          : fase === 'transcribiendo'
            ? mensaje || 'Entendiendo…'
            : ''

  return (
    <div className={`hud ${abierto ? 'abierto' : ''}`}>
      <div className="hud-fila">
        <button
          className={`hud-boton ${fase}`}
          onMouseDown={alPulsar}
          title="Pulsa para hablar. Arrastra para mover."
        >
          {fase === 'escuchando' ? (
            <span className="hud-barras" aria-hidden="true">
              {barras.slice(0, 7).map((v, i) => (
                <span key={i} style={{ transform: `scaleY(${0.15 + v * 0.85})` }} />
              ))}
            </span>
          ) : (
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="9" y="2.6" width="6" height="11" rx="3" />
              <path d="M5.5 11.2a6.5 6.5 0 0 0 13 0" />
              <path d="M12 17.7v3.7" />
            </svg>
          )}
        </button>

        {abierto && (
          <div className="hud-acciones">
            <button onClick={() => void window.jarvis.hud.openApp()} title="Abrir JARVIS">
              ⤢
            </button>
            <button onClick={() => void window.jarvis.hud.close()} title="Cerrar el boton flotante">
              ✕
            </button>
          </div>
        )}
      </div>

      {abierto && (
        <div className="hud-panel">
          {pista && <p className="hud-pista">{pista}</p>}
          {fase === 'error' && <p className="hud-error">{mensaje}</p>}
          {dicho && <p className="hud-dicho">{dicho}</p>}
          {respuesta && <p className="hud-respuesta">{respuesta}</p>}
        </div>
      )}
    </div>
  )
}

function ultimaRespuesta(mensajes: ChatMessage[]): string {
  const conTexto = mensajes.filter((m) => m.role === 'assistant' && m.text.trim())
  return conTexto.at(-1)?.text ?? 'No he sabido que responder.'
}
