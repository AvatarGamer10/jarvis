import type { CalendarEvent } from '@shared/types'
import { useAsync } from '../lib/useAsync'

/** Devuelve el rango [hoy 00:00, hoy + dias] en ISO. */
function range(days: number): [string, string] {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + days)
  return [from.toISOString(), to.toISOString()]
}

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
  const [from, to] = range(7)
  const { data, loading, error, reload } = useAsync<CalendarEvent[]>(
    () => window.jarvis.calendar.list(from, to),
    [from, to]
  )

  return (
    <>
      <h1 className="page-title">Agenda</h1>
      <p className="page-subtitle">Los proximos 7 dias de tu calendario principal.</p>

      {error && (
        <div className="alert error">
          {error}
          <div style={{ marginTop: 10 }}>
            <button onClick={reload}>Reintentar</button>
          </div>
        </div>
      )}

      {loading && <p className="empty">Cargando eventos…</p>}

      {!loading && !error && data && data.length === 0 && (
        <p className="empty">No tienes nada en el calendario esta semana.</p>
      )}

      {data &&
        [...groupByDay(data)].map(([day, events]) => (
          <div className="card" key={day}>
            <h3 style={{ textTransform: 'capitalize' }}>{day}</h3>
            {events.map((event) => (
              <div className="list-item" key={event.id}>
                <div>
                  <div>{event.title}</div>
                  {event.location && <div className="meta">{event.location}</div>}
                </div>
                <div className="meta" style={{ whiteSpace: 'nowrap' }}>
                  {event.allDay
                    ? 'Todo el dia'
                    : `${timeFormatter.format(new Date(event.start))} – ${timeFormatter.format(
                        new Date(event.end)
                      )}`}
                </div>
              </div>
            ))}
          </div>
        ))}
    </>
  )
}
