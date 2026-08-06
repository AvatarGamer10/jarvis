import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@shared/types'
import { BANDAS, grabar, MicrofonoNoDisponible, type Grabacion } from '../lib/microfono'
import { sound } from '../lib/sound'
import { cargarModelo, modeloListo, transcribir, type ProgresoModelo } from '../lib/transcripcion'
import { tts } from '../lib/tts'

type Fase = 'reposo' | 'escuchando' | 'transcribiendo' | 'pensando' | 'hablando'

const TEXTO_FASE: Record<Fase, string> = {
  reposo: 'Manten pulsado para hablar',
  escuchando: 'Te escucho',
  transcribiendo: 'Entendiendo lo que has dicho',
  pensando: 'Pensando',
  hablando: 'Respondiendo'
}

interface Turno {
  id: string
  quien: 'tu' | 'jarvis'
  texto: string
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
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [error, setError] = useState<string | null>(null)
  const [modelo, setModelo] = useState<ProgresoModelo | null>(null)
  const [barras, setBarras] = useState<number[]>(() => new Array(BANDAS).fill(0))

  const grabacion = useRef<Grabacion | null>(null)
  const animacion = useRef<number | null>(null)
  const fondo = useRef<HTMLDivElement>(null)
  /**
   * Abrir el microfono tarda unos milisegundos. Si se suelta la tecla en ese
   * hueco, `terminar` no encuentra grabacion y se va sin hacer nada, dejando
   * el microfono abierto para siempre. Esta marca recoge esa peticion para
   * atenderla en cuanto la grabacion exista.
   */
  const soltadoPronto = useRef(false)

  useEffect(() => {
    tts.preparar()
    return () => {
      grabacion.current?.cancelar()
      tts.callar()
      if (animacion.current) cancelAnimationFrame(animacion.current)
    }
  }, [])

  // La conversacion crece hacia abajo, asi que se sigue al ultimo turno.
  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turnos, fase])

  const anadir = (quien: Turno['quien'], texto: string): void =>
    setTurnos((previos) => [...previos, { id: crypto.randomUUID(), quien, texto }])

  const prepararModelo = async (): Promise<void> => {
    setError(null)
    try {
      await cargarModelo(setModelo)
    } catch {
      // cargarModelo ya ha publicado el estado de error.
    }
  }

  const empezar = async (): Promise<void> => {
    if (fase !== 'reposo' || grabacion.current) return

    setError(null)
    soltadoPronto.current = false
    tts.callar()

    let nueva: Grabacion
    try {
      nueva = await grabar()
    } catch (err) {
      setError(
        err instanceof MicrofonoNoDisponible
          ? err.message
          : `No se pudo grabar: ${(err as Error).message}`
      )
      return
    }

    grabacion.current = nueva

    // Si se solto la tecla mientras se abria el microfono, se cierra ya.
    if (soltadoPronto.current) {
      soltadoPronto.current = false
      setFase('escuchando')
      void terminar()
      return
    }

    sound.play('nav')
    setFase('escuchando')

    // Por fotograma y no con temporizador: asi el visualizador va sincronizado
    // con el repintado y no da tirones.
    const medir = (): void => {
      if (!grabacion.current) return
      setBarras(grabacion.current.bandas())
      animacion.current = requestAnimationFrame(medir)
    }
    medir()
  }

  const terminar = async (): Promise<void> => {
    // Se solto antes de que el microfono llegara a abrirse: se deja anotado
    // para que `empezar` lo cierre en cuanto termine.
    if (!grabacion.current) {
      soltadoPronto.current = true
      return
    }
    if (fase !== 'escuchando') return

    if (animacion.current) cancelAnimationFrame(animacion.current)
    setBarras(new Array(BANDAS).fill(0))
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

    anadir('tu', texto)
    setFase('pensando')

    const resultado = await window.jarvis.agent.send(texto)
    if (!resultado.ok) {
      setError(resultado.error)
      setFase('reposo')
      return
    }

    const contestacion = ultimaRespuesta(resultado.data)
    anadir('jarvis', contestacion)
    setFase('hablando')
    tts.hablar(contestacion, () => setFase('reposo'))
  }

  // Barra espaciadora como alternativa al raton, sin capturarla si el foco
  // esta en un campo de texto.
  useEffect(() => {
    const abajo = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || e.repeat) return
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      e.preventDefault()
      void empezar()
    }
    const arriba = (e: KeyboardEvent): void => {
      if (e.code === 'Space') void terminar()
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
  const trabajando = fase === 'transcribiendo' || fase === 'pensando'

  if (!listo) {
    return (
      <div className="voz-vacio">
        <MicroSvg grande />
        <h3 className="voz-titulo">Hablar con JARVIS</h3>
        <p className="voz-explica">
          Para entenderte, JARVIS necesita un modelo de voz que funciona dentro de tu ordenador.
          Se descarga una vez, ocupa unos 145 MB, y despues no necesita internet.
        </p>

        {descargando ? (
          <div className="voz-descarga">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="meta">{modelo?.mensaje}</span>
              <span className="mono">{modelo?.porcentaje}%</span>
            </div>
            <div className="update-bar" style={{ marginTop: 8 }}>
              <div className="update-bar-fill" style={{ width: `${modelo?.porcentaje ?? 0}%` }} />
            </div>
          </div>
        ) : (
          <>
            {modelo?.fase === 'error' && <div className="alert error">{modelo.mensaje}</div>}
            <button className="primary" onClick={prepararModelo}>
              Descargar el modelo de voz
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="voz-pantalla">
      <div className="voz-hilo">
        {turnos.length === 0 && (
          <div className="voz-sugerencias">
            <p className="meta">Prueba a decirle:</p>
            {['¿Que tareas tengo?', '¿Que tengo manana?', 'Apunta que tengo examen el viernes'].map(
              (s) => (
                <span key={s} className="voz-sugerencia">
                  {s}
                </span>
              )
            )}
          </div>
        )}

        {turnos.map((t) => (
          <div key={t.id} className={`voz-turno ${t.quien}`}>
            <span className="voz-quien">{t.quien === 'tu' ? 'Tu' : 'JARVIS'}</span>
            <p>{t.texto}</p>
            {t.quien === 'jarvis' && (
              <button className="link" onClick={() => tts.hablar(t.texto)}>
                Repetir
              </button>
            )}
          </div>
        ))}

        <div ref={fondo} />
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="voz-control">
        <div className={`voz-barras ${fase === 'escuchando' ? 'activo' : ''}`} aria-hidden="true">
          {barras.map((valor, i) => (
            <span
              key={i}
              style={{
                // Altura minima para que las barras existan en silencio; sin
                // ella el visualizador desaparece y parece que se ha roto.
                transform: `scaleY(${0.12 + valor * 0.88})`
              }}
            />
          ))}
        </div>

        <button
          className={`voz-boton ${fase}`}
          disabled={trabajando}
          onMouseDown={empezar}
          onMouseUp={terminar}
          onMouseLeave={() => fase === 'escuchando' && void terminar()}
          aria-label="Manten pulsado para hablar"
        >
          <MicroSvg />
        </button>

        <p className={`voz-estado ${fase !== 'reposo' ? 'trabajando' : ''}`}>
          {TEXTO_FASE[fase]}
          {trabajando && <span className="voz-puntos" aria-hidden="true" />}
        </p>

        {fase === 'reposo' && (
          <p className="hint">
            o manten <kbd>Espacio</kbd>
          </p>
        )}
        {fase === 'hablando' && (
          <button className="link" onClick={() => { tts.callar(); setFase('reposo') }}>
            Callar
          </button>
        )}
      </div>
    </div>
  )
}

/** Microfono en SVG, no emoji: el resto de iconos de la app tambien lo son. */
function MicroSvg({ grande }: { grande?: boolean }): JSX.Element {
  const lado = grande ? 44 : 30
  return (
    <svg
      width={lado}
      height={lado}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="9" y="2.6" width="6" height="11" rx="3" />
      <path d="M5.5 11.2a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.7v3.7" />
    </svg>
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
