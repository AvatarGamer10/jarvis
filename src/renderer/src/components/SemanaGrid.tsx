import { useEffect, useMemo, useRef, useState } from 'react'
import type { CalendarEvent } from '@shared/types'
import {
  colocarDia,
  diasDeLaSemana,
  esBloqueEstudio,
  eventosDeDiaCompleto,
  fechaDe,
  franja,
  mismoDia
} from '../lib/semana'

/** Altura de una hora en pixeles. Manda en toda la geometria de la rejilla. */
const ALTO_HORA = 46

const fmtDiaCorto = new Intl.DateTimeFormat('es-ES', { weekday: 'short' })
const fmtHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

interface Props {
  eventos: CalendarEvent[]
  /** Lunes de la semana a pintar. */
  lunes: Date
}

/**
 * Rejilla de lunes a domingo con los eventos colocados por hora.
 *
 * Frente a la lista, lo que aporta es ver los huecos: el planificador propone
 * bloques de estudio en los ratos libres, y en una lista plana no se entiende
 * por que ha elegido esos y no otros.
 */
export default function SemanaGrid({ eventos, lunes }: Props): JSX.Element {
  const dias = useMemo(() => diasDeLaSemana(lunes), [lunes])
  const { inicio, fin } = useMemo(() => franja(eventos), [eventos])
  const horas = useMemo(
    () => Array.from({ length: fin - inicio }, (_, i) => inicio + i),
    [inicio, fin]
  )

  const cuerpo = useRef<HTMLDivElement>(null)
  const rejilla = useRef<HTMLDivElement>(null)
  const [ahora, setAhora] = useState(() => new Date())

  // La linea de "ahora" se queda parada si no se refresca. Cada minuto basta:
  // es lo que tarda en moverse un pixel.
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const altoTotal = (fin - inicio) * ALTO_HORA
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes() - inicio * 60
  const columnaHoy = dias.findIndex((d) => mismoDia(d, ahora))
  const verAhora = columnaHoy >= 0 && minutosAhora >= 0 && minutosAhora <= (fin - inicio) * 60

  // Al abrir la semana en curso, centrar la vista en la hora actual en vez de
  // dejarla arriba del todo: casi siempre lo que interesa esta ahi.
  useEffect(() => {
    if (!verAhora || !cuerpo.current || !rejilla.current) return
    // Desde el inicio de la rejilla, no del contenedor: la cabecera va dentro
    // y ocupa sus propios pixeles de scroll.
    const y =
      rejilla.current.offsetTop +
      (minutosAhora / 60) * ALTO_HORA -
      cuerpo.current.clientHeight / 2
    cuerpo.current.scrollTop = Math.max(0, y)
    // Solo al cambiar de semana: si dependiera de `ahora`, saltaria cada minuto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lunes, inicio])

  const todoElDia = dias.map((d) => eventosDeDiaCompleto(eventos, d))
  const hayTodoElDia = todoElDia.some((lista) => lista.length > 0)

  const abrir = (evento: CalendarEvent): void => {
    if (evento.htmlLink) void window.jarvis.shell.openExternal(evento.htmlLink)
  }

  return (
    <div className="semana">
      {/* Cabecera y cuerpo comparten contenedor a proposito: si la barra de
          desplazamiento estrechara solo al cuerpo, los dias dejarian de caer
          sobre sus eventos. */}
      <div className="semana-cuerpo" ref={cuerpo}>
        <div className="semana-fijo">
          <div className="semana-fila semana-cabecera">
            <div className="semana-hueco" />
            {dias.map((d) => (
              <div key={d.toISOString()} className="semana-dia" data-hoy={mismoDia(d, ahora)}>
                <span className="semana-dia-nombre">{fmtDiaCorto.format(d).replace('.', '')}</span>
                <span className="semana-dia-numero mono">{d.getDate()}</span>
              </div>
            ))}
          </div>

          {hayTodoElDia && (
            <div className="semana-fila semana-todoeldia">
              <div className="semana-hueco mono">todo el día</div>
              {dias.map((d, i) => (
                <div key={d.toISOString()} className="semana-todoeldia-col">
                  {todoElDia[i].map((e) => (
                    <button
                      key={e.id}
                      className="semana-evento semana-evento-dia"
                      data-estudio={esBloqueEstudio(e)}
                      title={e.title}
                      onClick={() => abrir(e)}
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="semana-fila" ref={rejilla} style={{ height: altoTotal }}>
          <div className="semana-horas">
            {horas.map((h) => (
              <div key={h} className="semana-hora mono" style={{ height: ALTO_HORA }}>
                {String(h).padStart(2, '0')}
              </div>
            ))}
          </div>

          {dias.map((d, i) => (
            <div key={d.toISOString()} className="semana-col" data-hoy={mismoDia(d, ahora)}>
              {horas.map((h) => (
                <div key={h} className="semana-linea" style={{ height: ALTO_HORA }} />
              ))}

              {colocarDia(eventos, d, inicio).map((c) => {
                const ancho = 100 / c.columnas
                return (
                  <button
                    key={c.evento.id}
                    className="semana-evento"
                    data-estudio={esBloqueEstudio(c.evento)}
                    title={`${c.evento.title}\n${fmtHora.format(fechaDe(c.evento.start))}–${fmtHora.format(fechaDe(c.evento.end))}${c.evento.location ? `\n${c.evento.location}` : ''}`}
                    onClick={() => abrir(c.evento)}
                    style={{
                      top: (c.desde / 60) * ALTO_HORA,
                      // Un evento que cruza la medianoche se recorta al borde
                      // de la rejilla en vez de desbordarla.
                      height: Math.min(
                        (c.duracion / 60) * ALTO_HORA,
                        altoTotal - (c.desde / 60) * ALTO_HORA
                      ),
                      left: `${c.columna * ancho}%`,
                      width: `${ancho}%`
                    }}
                  >
                    <span className="semana-evento-hora mono">
                      {fmtHora.format(fechaDe(c.evento.start))}
                    </span>
                    <span className="semana-evento-titulo">
                      {esBloqueEstudio(c.evento)
                        ? c.evento.title.replace(/^Estudiar:\s*/, '')
                        : c.evento.title}
                    </span>
                  </button>
                )
              })}

              {verAhora && i === columnaHoy && (
                <div className="semana-ahora" style={{ top: (minutosAhora / 60) * ALTO_HORA }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
