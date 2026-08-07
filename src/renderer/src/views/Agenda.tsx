import { useMemo, useState } from 'react'
import type { CalendarEvent } from '@shared/types'
import BriefCard from '../components/BriefCard'
import Planificador from '../components/Planificador'
import SemanaGrid from '../components/SemanaGrid'
import { lunesDe, tituloSemana } from '../lib/semana'
import { useAsync } from '../lib/useAsync'

type Modo = 'semana' | 'lista'

const CLAVE_MODO = 'jarvis.agenda.modo'

const dayFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
})
const timeFormatter = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const key = dayFormatter.format(new Date(event.start))
    const list = groups.get(key)
    if (list) list.push(event)
    else groups.set(key, [event])
  }
  return groups
}

export default function Agenda(): JSX.Element {
  const [modo, setModo] = useState<Modo>(
    () => (localStorage.getItem(CLAVE_MODO) as Modo | null) ?? 'semana'
  )
  /** Semanas de distancia respecto a la actual. 0 = esta semana. */
  const [salto, setSalto] = useState(0)

  const lunes = useMemo(() => {
    const d = lunesDe(new Date())
    d.setDate(d.getDate() + salto * 7)
    return d
  }, [salto])

  // La lista sigue mirando los proximos 7 dias desde hoy; la rejilla, la
  // semana natural que se este viendo.
  const [from, to] = useMemo(() => {
    const desde = modo === 'semana' ? new Date(lunes) : new Date()
    if (modo === 'lista') desde.setHours(0, 0, 0, 0)
    const hasta = new Date(desde)
    hasta.setDate(hasta.getDate() + 7)
    return [desde.toISOString(), hasta.toISOString()]
  }, [modo, lunes])

  const { data, loading, error, reload } = useAsync<CalendarEvent[]>(
    () => window.jarvis.calendar.list(from, to),
    [from, to]
  )

  const cambiarModo = (siguiente: Modo): void => {
    setModo(siguiente)
    localStorage.setItem(CLAVE_MODO, siguiente)
    setSalto(0)
  }

  return (
    <>
      <p className="page-subtitle">
        {modo === 'semana' ? 'Tu semana de un vistazo.' : 'Los proximos 7 dias de tu calendario.'}
      </p>

      <div className="card">
        <div className="semana-barra">
          {modo === 'semana' ? (
            <>
              <button className="semana-flecha" onClick={() => setSalto((s) => s - 1)} title="Semana anterior">
                ‹
              </button>
              <h3 className="semana-titulo">{tituloSemana(lunes)}</h3>
              <button className="semana-flecha" onClick={() => setSalto((s) => s + 1)} title="Semana siguiente">
                ›
              </button>
              {salto !== 0 && (
                <button className="semana-hoy" onClick={() => setSalto(0)}>
                  Hoy
                </button>
              )}
            </>
          ) : (
            <h3 className="semana-titulo">Proximos 7 dias</h3>
          )}

          <div className="semana-modo">
            <button
              className={modo === 'semana' ? 'primary' : ''}
              onClick={() => cambiarModo('semana')}
            >
              Semana
            </button>
            <button
              className={modo === 'lista' ? 'primary' : ''}
              onClick={() => cambiarModo('lista')}
            >
              Lista
            </button>
          </div>
        </div>

        {error && (
          <div className="alert error">
            {error}
            <div style={{ marginTop: 10 }}>
              <button onClick={reload}>Reintentar</button>
            </div>
          </div>
        )}

        {loading && <p className="empty">Cargando eventos…</p>}

        {!loading && !error && data && (
          <>
            {modo === 'semana' && <SemanaGrid eventos={data} lunes={lunes} />}

            {modo === 'lista' && data.length === 0 && (
              <p className="empty">No tienes nada en el calendario esta semana.</p>
            )}

            {modo === 'lista' &&
              [...groupByDay(data)].map(([day, events]) => (
                <div key={day} style={{ marginTop: 14 }}>
                  <div className="voz-quien" style={{ textTransform: 'capitalize' }}>
                    {day}
                  </div>
                  {events.map((event) => (
                    <div className="list-item" key={event.id}>
                      <div>
                        <div>{event.title}</div>
                        {event.location && <div className="meta">{event.location}</div>}
                      </div>
                      <span className="mono" style={{ whiteSpace: 'nowrap' }}>
                        {event.allDay
                          ? 'Todo el dia'
                          : `${timeFormatter.format(new Date(event.start))}–${timeFormatter.format(
                              new Date(event.end)
                            )}`}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
          </>
        )}
      </div>

      <BriefCard />
      <Planificador />
    </>
  )
}
