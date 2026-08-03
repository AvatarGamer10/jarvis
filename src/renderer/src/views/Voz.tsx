import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@shared/types'
import { grabar, MicrofonoNoDisponible, type Grabacion } from '../lib/microfono'
import { sound } from '../lib/sound'
import {
  cargarModelo,
  modeloListo,
  transcribir,
  type ProgresoModelo
} from '../lib/transcripcion'
import { tts } from '../lib/tts'

type Fase = 'reposo' | 'escuchando' | 'transcribiendo' | 'pensando' | 'hablando'

const TEXTO_FASE: Record<Fase, string> = {
  reposo: 'Manten pulsado para hablar',
  escuchando: 'Te escucho…',
  transcribiendo: 'Entendiendo lo que has dicho…',
  pensando: 'Pensando…',
  hablando: 'Respondiendo'
}

/**
 * Conversacion por voz.
 *
 * Es pulsar para hablar, no palabra de activacion. Detectar "Jarvis" de forma
 * fiable exige un motor con licencia propia, y una version casera transcribe
 * en bucle: se come la bateria y falla a menudo. Mantener pulsada una tecla no
 * falla nunca y no gasta nada en reposo.
 */
export default function Voz(): JSX.Element {
  const [fase, setFase] = useState<Fase>('reposo')
  const [dicho, setDicho] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modelo, setModelo] = useState<ProgresoModelo | null>(null)
  const [nivel, setNivel] = useState(0)

  const grabacion = useRef<Grabacion | null>(null)
  const animacion = useRef<number | null>(null)

  useEffect(() => {
    tts.preparar()
    return () => {
      grabacion.current?.cancelar()
      tts.callar()
      if (animacion.current) cancelAnimationFrame(animacion.current)
    }
  }, [])

  const prepararModelo = async (): Promise<void> => {
    setError(null)
    try {
      await cargarModelo(setModelo)
    } catch {
      // El estado de error ya lo ha publicado cargarModelo.
    }
  }

  const empezar = async (): Promise<void> => {
    if (fase !== 'reposo') return

    setError(null)
    setDicho('')
    setRespuesta('')
    tts.callar()

    try {
      grabacion.current = await grabar()
    } catch (err) {
      setError(
        err instanceof MicrofonoNoDisponible ? err.message : `No se pudo grabar: ${(err as Error).message}`
      )
      return
    }

    sound.play('nav')
    setFase('escuchando')

    // El nivel se lee por fotograma, no con un temporizador: asi el indicador
    // va sincronizado con el repintado y no da tirones.
    const medir = (): void => {
      if (!grabacion.current) return
      setNivel(grabacion.current.nivel())
      animacion.current = requestAnimationFrame(medir)
    }
    medir()
  }

  const terminar = async (): Promise<void> => {
    if (fase !== 'escuchando' || !grabacion.current) return

    if (animacion.current) cancelAnimationFrame(animacion.current)
    setNivel(0)
    setFase('transcribiendo')

    let texto = ''
    try {
      const audio = await grabacion.current.detener()
      grabacion.current = null
      texto = await transcribir(audio)
    } catch (err) {
      setError(`No se pudo entender el audio: ${(err as Error).message}`)
      setFase('reposo')
      return
    }

    if (!texto) {
      setFase('reposo')
      setError('No he oido nada. Prueba a acercarte al microfono.')
      return
    }

    setDicho(texto)
    setFase('pensando')

    const resultado = await window.jarvis.agent.send(texto)
    if (!resultado.ok) {
      setError(resultado.error)
      setFase('reposo')
      return
    }

    const contestacion = ultimaRespuesta(resultado.data)
    setRespuesta(contestacion)
    setFase('hablando')
    tts.hablar(contestacion, () => setFase('reposo'))
  }

  // Barra espaciadora como alternativa al raton, sin capturarla si el foco
  // esta en un campo de texto de otra parte de la app.
  useEffect(() => {
    const abajo = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || e.repeat) return
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      e.preventDefault()
      void empezar()
    }
    const arriba = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      void terminar()
    }
    window.addEventListener('keydown', abajo)
    window.addEventListener('keyup', arriba)
    return () => {
      window.removeEventListener('keydown', abajo)
      window.removeEventListener('keyup', arriba)
    }
  }, [fase])

  const listo = modeloListo() || modelo?.fase === 'listo'
  const descargando = modelo?.fase === 'descargando'

  return (
    <>
      <p className="page-subtitle">Habla y te contesta. Todo se procesa en tu ordenador.</p>

      {error && <div className="alert error">{error}</div>}

      {!listo && (
        <div className="card">
          <h3>Primero, la voz</h3>
          {descargando ? (
            <>
              <p className="meta" style={{ marginTop: 0 }}>
                {modelo?.mensaje} · {modelo?.porcentaje}%
              </p>
              <div className="update-bar">
                <div className="update-bar-fill" style={{ width: `${modelo?.porcentaje ?? 0}%` }} />
              </div>
            </>
          ) : (
            <>
              <p className="meta" style={{ marginTop: 0 }}>
                Para entenderte hace falta descargar el modelo de voz una sola vez. Entre 80 y 145
                MB segun cual admita tu equipo. Despues funciona sin internet.
              </p>
              {modelo?.fase === 'error' && <p className="hint intro-error">{modelo.mensaje}</p>}
              <button className="primary" onClick={prepararModelo} style={{ marginTop: 12 }}>
                Descargar el modelo de voz
              </button>
            </>
          )}
        </div>
      )}

      <div className="voz">
        <button
          className={`voz-boton ${fase === 'escuchando' ? 'activo' : ''}`}
          disabled={!listo || (fase !== 'reposo' && fase !== 'escuchando')}
          onMouseDown={empezar}
          onMouseUp={terminar}
          onMouseLeave={() => fase === 'escuchando' && void terminar()}
          aria-label="Manten pulsado para hablar"
        >
          {/* El anillo crece con la voz: se ve que te esta oyendo de verdad. */}
          <span
            className="voz-onda"
            style={{ transform: `scale(${1 + nivel * 0.85})`, opacity: 0.25 + nivel * 0.6 }}
          />
          <span className="voz-icono" aria-hidden="true">
            {fase === 'escuchando' ? '●' : '🎙'}
          </span>
        </button>

        <p className={`voz-estado ${fase !== 'reposo' ? 'trabajando' : ''}`}>{TEXTO_FASE[fase]}</p>
        {listo && fase === 'reposo' && (
          <p className="hint">Tambien vale mantener la barra espaciadora.</p>
        )}
      </div>

      {dicho && (
        <div className="card">
          <h3>Has dicho</h3>
          <p style={{ margin: 0 }}>{dicho}</p>
        </div>
      )}

      {respuesta && (
        <div className="card">
          <h3>JARVIS</h3>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{respuesta}</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={() => tts.hablar(respuesta)}>Repetir</button>
            <button onClick={() => tts.callar()}>Callar</button>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * El agente devuelve varios mensajes cuando usa herramientas. Para leer en voz
 * alta solo interesa el ultimo con texto: recitar "he llamado a calendar_list"
 * no le sirve a nadie.
 */
function ultimaRespuesta(mensajes: ChatMessage[]): string {
  const conTexto = mensajes.filter((m) => m.role === 'assistant' && m.text.trim())
  return conTexto.at(-1)?.text ?? 'No he sabido que responder.'
}
