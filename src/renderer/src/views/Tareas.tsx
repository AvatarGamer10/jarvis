import type { Assignment, SubmissionState } from '@shared/types'
import { useAsync } from '../lib/useAsync'

const BADGE: Record<SubmissionState, string> = {
  PENDIENTE: 'warn',
  ATRASADA: 'danger',
  ENTREGADA: 'ok',
  DEVUELTA: 'ok',
  DESCONOCIDA: 'dim'
}

function dueLabel(a: Assignment): string {
  if (a.dueDate === null) return 'Sin fecha'
  if (a.daysLeft === null) return 'Sin fecha'
  if (a.daysLeft === 0) return 'Hoy'
  if (a.daysLeft === 1) return 'Manana'
  if (a.daysLeft < 0) return `Hace ${Math.abs(a.daysLeft)} dia(s)`
  return `En ${a.daysLeft} dias`
}

export default function Tareas(): JSX.Element {
  const { data, loading, error, reload } = useAsync<Assignment[]>(() =>
    window.jarvis.classroom.list()
  )

  const pending = data?.filter((a) => a.state === 'PENDIENTE' || a.state === 'ATRASADA') ?? []
  const done = data?.filter((a) => a.state === 'ENTREGADA' || a.state === 'DEVUELTA') ?? []

  return (
    <>
      <h1 className="page-title">Tareas</h1>
      <p className="page-subtitle">Google Classroom, ordenadas por fecha de entrega.</p>

      {error && (
        <div className="alert error">
          {error}
          <div style={{ marginTop: 10 }}>
            <button onClick={reload}>Reintentar</button>
          </div>
        </div>
      )}

      {loading && <p className="empty">Cargando tareas…</p>}

      {!loading && !error && (
        <>
          <div className="card">
            <h3>Pendientes ({pending.length})</h3>
            {pending.length === 0 ? (
              <p className="empty">Nada pendiente. Buen momento para descansar.</p>
            ) : (
              pending.map((a) => (
                <div className="list-item" key={a.id}>
                  <div>
                    <div>{a.title}</div>
                    <div className="meta">
                      {a.courseName} · {dueLabel(a)}
                    </div>
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <span className={`badge ${BADGE[a.state]}`}>{a.state}</span>
                    <button onClick={() => void window.jarvis.shell.openExternal(a.link)}>
                      Abrir
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {done.length > 0 && (
            <div className="card">
              <h3>Ya entregadas ({done.length})</h3>
              {done.slice(0, 10).map((a) => (
                <div className="list-item" key={a.id}>
                  <div>
                    <div>{a.title}</div>
                    <div className="meta">{a.courseName}</div>
                  </div>
                  <span className={`badge ${BADGE[a.state]}`}>{a.state}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
