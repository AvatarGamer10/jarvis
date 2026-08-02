import { useEffect, useState } from 'react'
import type { Assignment, ManualTask, SubmissionState } from '@shared/types'
import { sound } from '../lib/sound'
import { dueLabel, urgencyOf } from '../lib/urgency'

const BADGE: Record<SubmissionState, string> = {
  PENDIENTE: 'warn',
  ATRASADA: 'danger',
  ENTREGADA: 'ok',
  DEVUELTA: 'ok',
  DESCONOCIDA: 'dim'
}

export default function Tareas(): JSX.Element {
  const [manual, setManual] = useState<ManualTask[]>([])
  const [classroom, setClassroom] = useState<Assignment[]>([])
  const [classroomError, setClassroomError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [due, setDue] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)

    // Las dos fuentes se piden por separado a proposito: que Classroom falle
    // (cuenta sin aprobar, sin sesion) no debe dejar sin tareas al usuario.
    const [m, c] = await Promise.all([
      window.jarvis.tasks.list(),
      window.jarvis.classroom.list()
    ])

    if (m.ok) setManual(m.data)
    else setError(m.error)

    if (c.ok) {
      setClassroom(c.data)
      setClassroomError(null)
    } else {
      setClassroom([])
      setClassroomError(c.error)
    }

    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const add = async (): Promise<void> => {
    if (!title.trim()) return
    setAdding(true)
    setError(null)

    const result = await window.jarvis.tasks.add({
      title,
      subject,
      dueDate: due ? new Date(`${due}T23:59`).toISOString() : null
    })

    if (result.ok) {
      sound.play('confirm')
      setTitle('')
      setSubject('')
      setDue('')
      await load()
    } else {
      setError(result.error)
    }
    setAdding(false)
  }

  const toggle = async (task: ManualTask): Promise<void> => {
    // Solo suena al completar. Deshacer no es un logro.
    if (!task.done) sound.play('done')
    await window.jarvis.tasks.update(task.id, { done: !task.done })
    await load()
  }

  const remove = async (id: string): Promise<void> => {
    sound.play('cancel')
    await window.jarvis.tasks.remove(id)
    await load()
  }

  const pendingManual = manual.filter((t) => !t.done)
  const doneManual = manual.filter((t) => t.done)
  const pendingClassroom = classroom.filter(
    (a) => a.state === 'PENDIENTE' || a.state === 'ATRASADA'
  )

  return (
    <>
      <h1 className="page-title">Tareas</h1>
      <p className="page-subtitle">Lo tuyo apuntado a mano, y lo de Classroom cuando este disponible.</p>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h3>Apuntar una tarea</h3>
        <div className="field">
          <label htmlFor="task-title">Que hay que hacer</label>
          <input
            id="task-title"
            type="text"
            value={title}
            placeholder="Ejercicios 4 a 12 del tema 3"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
          />
        </div>

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="task-subject">Asignatura</label>
            <input
              id="task-subject"
              type="text"
              value={subject}
              placeholder="Fisica"
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="task-due">Entrega</label>
            <input
              id="task-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <button className="primary" onClick={add} disabled={adding || !title.trim()}>
            Apuntar
          </button>
        </div>
      </div>

      {loading && <p className="empty">Cargando…</p>}

      {!loading && (
        <>
          <div className="card">
            <h3>Pendientes ({pendingManual.length + pendingClassroom.length})</h3>

            {pendingManual.length === 0 && pendingClassroom.length === 0 ? (
              <p className="empty">Nada pendiente. Buen momento para descansar.</p>
            ) : (
              <>
                {pendingManual.map((task) => (
                  <div className="list-item" key={task.id} data-urgency={urgencyOf(task.dueDate)}>
                    <div>
                      <div>{task.title}</div>
                      <div className="row" style={{ gap: 8, marginTop: 3 }}>
                        <span className="due" data-urgency={urgencyOf(task.dueDate)}>
                          {dueLabel(task.dueDate)}
                        </span>
                        {task.subject && <span className="meta">{task.subject}</span>}
                      </div>
                    </div>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button onClick={() => void toggle(task)}>Hecha</button>
                      <button onClick={() => void remove(task.id)}>Borrar</button>
                    </div>
                  </div>
                ))}

                {pendingClassroom.map((a) => (
                  <div className="list-item" key={a.id} data-urgency={urgencyOf(a.dueDate)}>
                    <div>
                      <div>{a.title}</div>
                      <div className="row" style={{ gap: 8, marginTop: 3 }}>
                        <span className="due" data-urgency={urgencyOf(a.dueDate)}>
                          {dueLabel(a.dueDate)}
                        </span>
                        <span className="meta">{a.courseName}</span>
                        <span className="badge dim">Classroom</span>
                      </div>
                    </div>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <span className={`badge ${BADGE[a.state]}`}>{a.state}</span>
                      <button onClick={() => void window.jarvis.shell.openExternal(a.link)}>
                        Abrir
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="card">
            <h3>Google Classroom</h3>
            {classroomError ? (
              <>
                <p className="meta" style={{ marginTop: 0 }}>
                  {classroomError}
                </p>
                <p className="hint">
                  Si el mensaje habla del administrador de tu centro, es que el colegio aun no ha
                  aprobado la aplicacion. Mientras tanto puedes apuntar tus tareas aqui arriba: en
                  cuanto la aprueben, las de Classroom apareceran solas junto a las tuyas.
                </p>
                <button onClick={load} style={{ marginTop: 10 }}>
                  Reintentar
                </button>
              </>
            ) : classroom.length === 0 ? (
              <>
                <p className="meta" style={{ marginTop: 0 }}>
                  Conectado, pero no aparece ningun curso.
                </p>
                <p className="hint">
                  Normal si has iniciado sesion con una cuenta personal: tus clases viven en la
                  cuenta del colegio. Cuando el centro apruebe la aplicacion, cierra sesion en
                  Ajustes y vuelve a entrar con la del colegio.
                </p>
                <button onClick={load} style={{ marginTop: 10 }}>
                  Actualizar
                </button>
              </>
            ) : (
              <>
                <p className="meta" style={{ marginTop: 0 }}>
                  {classroom.length} tarea(s) sincronizada(s).
                </p>
                <button onClick={load}>Actualizar</button>
              </>
            )}
          </div>

          {doneManual.length > 0 && (
            <div className="card">
              <h3>Ya hechas ({doneManual.length})</h3>
              {doneManual.slice(0, 10).map((task) => (
                <div className="list-item" key={task.id}>
                  <div>
                    <div style={{ opacity: 0.6, textDecoration: 'line-through' }}>{task.title}</div>
                    <div className="meta">{task.subject}</div>
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button onClick={() => void toggle(task)}>Deshacer</button>
                    <button onClick={() => void remove(task.id)}>Borrar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
