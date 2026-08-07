import { useEffect, useMemo, useState } from 'react'
import type { Assignment, ManualTask, SubmissionState } from '@shared/types'
import Vacio from '../components/Vacio'
import { avisos } from '../lib/avisos'
import { atajosFecha, paraInput } from '../lib/fechas'
import { sound } from '../lib/sound'
import { dueLabel, urgencyOf } from '../lib/urgency'

const BADGE: Record<SubmissionState, string> = {
  PENDIENTE: 'warn',
  ATRASADA: 'danger',
  ENTREGADA: 'ok',
  DEVUELTA: 'ok',
  DESCONOCIDA: 'dim'
}

/** Lo que dura el tachado antes de que la tarea cambie de sitio. */
const TACHADO_MS = 420

/** Una fecha del almacen, en el formato que espera un <input type="date">. */
const aInput = (iso: string | null): string => (iso ? paraInput(new Date(iso)) : '')

/** Y de vuelta: al final del dia, que es cuando vence una entrega. */
const aIso = (valor: string): string | null =>
  valor ? new Date(`${valor}T23:59`).toISOString() : null

export default function Tareas(): JSX.Element {
  const [manual, setManual] = useState<ManualTask[]>([])
  const [classroom, setClassroom] = useState<Assignment[]>([])
  const [classroomError, setClassroomError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [due, setDue] = useState('')
  const [busqueda, setBusqueda] = useState('')
  /** Tarea que se esta editando en su sitio. */
  const [editando, setEditando] = useState<string | null>(null)
  /** Tareas con el tachado en marcha, aun sin mover de sitio. */
  const [tachando, setTachando] = useState<string[]>([])

  const atajos = useMemo(() => atajosFecha(), [])

  const load = async (): Promise<void> => {
    // Las dos fuentes se piden por separado a proposito: que Classroom falle
    // (cuenta sin aprobar, sin sesion) no debe dejar sin tareas al usuario.
    const [m, c] = await Promise.all([window.jarvis.tasks.list(), window.jarvis.classroom.list()])

    if (m.ok) setManual(m.data)
    else avisos.error(m.error)

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

    const result = await window.jarvis.tasks.add({
      title,
      subject,
      dueDate: aIso(due)
    })

    if (result.ok) {
      sound.play('confirm')
      setTitle('')
      setSubject('')
      setDue('')
      await load()
    } else {
      avisos.error(result.error)
    }
    setAdding(false)
  }

  /**
   * Completar una tarea.
   *
   * El tachado se pinta antes de recargar. Si la lista se reordenara al
   * instante, la tarea saltaria a otro sitio y no habria forma de ver que ha
   * pasado con ella.
   */
  const completar = async (task: ManualTask): Promise<void> => {
    if (task.done) {
      await window.jarvis.tasks.update(task.id, { done: false })
      await load()
      return
    }

    sound.play('done')
    setTachando((lista) => [...lista, task.id])
    await new Promise((listo) => setTimeout(listo, TACHADO_MS))

    const r = await window.jarvis.tasks.update(task.id, { done: true })
    if (!r.ok) avisos.error(r.error)
    setTachando((lista) => lista.filter((id) => id !== task.id))
    await load()
  }

  /**
   * Borrar con vuelta atras.
   *
   * No hay papelera en el almacen, asi que deshacer vuelve a crear la tarea con
   * los mismos datos. Cambia el id, que no se ve por ningun sitio; lo que
   * importa es no perder lo escrito por un clic mal dado.
   */
  const borrar = async (task: ManualTask): Promise<void> => {
    sound.play('cancel')
    const r = await window.jarvis.tasks.remove(task.id)
    if (!r.ok) {
      avisos.error(r.error)
      return
    }
    await load()

    avisos.mostrar(`Borrada «${task.title}»`, {
      accion: {
        etiqueta: 'Deshacer',
        ejecutar: async () => {
          const vuelta = await window.jarvis.tasks.add({
            title: task.title,
            subject: task.subject,
            dueDate: task.dueDate
          })
          if (!vuelta.ok) {
            avisos.error(vuelta.error)
            return
          }
          if (task.done) await window.jarvis.tasks.update(vuelta.data.id, { done: true })
          await load()
        }
      }
    })
  }

  const guardarEdicion = async (
    id: string,
    cambios: { title: string; subject: string; due: string }
  ): Promise<void> => {
    const r = await window.jarvis.tasks.update(id, {
      title: cambios.title,
      subject: cambios.subject,
      dueDate: aIso(cambios.due)
    })
    if (r.ok) {
      setEditando(null)
      await load()
    } else {
      avisos.error(r.error)
    }
  }

  /**
   * Busca sin acentos y sin mayusculas: quien escribe "fisica" espera
   * encontrar "Física", y obligar a teclear la tilde para buscar es hostil.
   */
  const normalizar = (texto: string): string =>
    texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')

  const aguja = normalizar(busqueda.trim())
  const coincide = (...campos: (string | null | undefined)[]): boolean =>
    aguja === '' || campos.some((c) => c && normalizar(c).includes(aguja))

  // Las que se estan tachando siguen contando como pendientes hasta que
  // termina la animacion: si no, desaparecerian del grupo a media transicion.
  const pendingManual = manual.filter((t) => !t.done && coincide(t.title, t.subject))
  const doneManual = manual.filter((t) => t.done && coincide(t.title, t.subject))
  const pendingClassroom = classroom.filter(
    (a) => (a.state === 'PENDIENTE' || a.state === 'ATRASADA') && coincide(a.title, a.courseName)
  )

  const buscando = aguja !== ''
  const totalPendientes =
    manual.filter((t) => !t.done).length +
    classroom.filter((a) => a.state === 'PENDIENTE' || a.state === 'ATRASADA').length

  return (
    <>
      <p className="page-subtitle">
        Lo tuyo apuntado a mano, y lo de Classroom cuando este disponible.
      </p>

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
            <input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <button className="primary" onClick={add} disabled={adding || !title.trim()}>
            Apuntar
          </button>
        </div>

        {/* Casi todo vence hoy, manana o el viernes. Abrir el calendario para
            eso es un gesto de mas cuatro de cada cinco veces. */}
        <div className="atajos">
          {atajos.map((a) => (
            <button
              key={a.id}
              className={due === a.valor ? 'primary' : ''}
              onClick={() => setDue(due === a.valor ? '' : a.valor)}
            >
              {a.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="empty">Cargando…</p>}

      {/* El buscador solo aparece cuando hay bastantes tareas: con cuatro,
          ocupa sitio sin resolver nada. */}
      {!loading && totalPendientes + manual.filter((t) => t.done).length >= 8 && (
        <div className="field buscador">
          <input
            type="text"
            value={busqueda}
            placeholder="Buscar por tarea o asignatura…"
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {buscando && (
            <button className="link" onClick={() => setBusqueda('')}>
              Limpiar
            </button>
          )}
        </div>
      )}

      {!loading && (
        <>
          <div className="card">
            <h3>
              {buscando ? 'Resultados' : 'Pendientes'} (
              {pendingManual.length + pendingClassroom.length}
              {buscando && ` de ${totalPendientes}`})
            </h3>

            {pendingManual.length === 0 && pendingClassroom.length === 0 ? (
              buscando ? (
                <p className="empty">Nada que coincida con «{busqueda.trim()}».</p>
              ) : (
                <Vacio
                  seccion="tareas"
                  titulo="Nada pendiente"
                  pista="Cuando te manden algo, apuntalo aqui arriba y JARVIS se encarga de recordartelo."
                />
              )
            ) : (
              <>
                {pendingManual.map((task) =>
                  editando === task.id ? (
                    <FilaEdicion
                      key={task.id}
                      task={task}
                      onGuardar={(cambios) => void guardarEdicion(task.id, cambios)}
                      onCancelar={() => setEditando(null)}
                    />
                  ) : (
                    <div
                      className="list-item"
                      key={task.id}
                      data-urgency={urgencyOf(task.dueDate)}
                      data-tachando={tachando.includes(task.id)}
                    >
                      <div>
                        <div className="tachable">{task.title}</div>
                        <div className="row" style={{ gap: 8, marginTop: 3 }}>
                          <span className="due" data-urgency={urgencyOf(task.dueDate)}>
                            {dueLabel(task.dueDate)}
                          </span>
                          {task.subject && <span className="meta">{task.subject}</span>}
                        </div>
                      </div>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button onClick={() => void completar(task)}>Hecha</button>
                        <button onClick={() => setEditando(task.id)}>Editar</button>
                        <button onClick={() => void borrar(task)}>Borrar</button>
                      </div>
                    </div>
                  )
                )}

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
                    <button onClick={() => void completar(task)}>Deshacer</button>
                    <button onClick={() => void borrar(task)}>Borrar</button>
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

/**
 * Una tarea editandose en su sitio.
 *
 * Antes habia que borrarla y volver a crearla para corregir una fecha. Los
 * campos son estado local para que teclear no repinte la lista entera.
 */
function FilaEdicion({
  task,
  onGuardar,
  onCancelar
}: {
  task: ManualTask
  onGuardar: (cambios: { title: string; subject: string; due: string }) => void
  onCancelar: () => void
}): JSX.Element {
  const [title, setTitle] = useState(task.title)
  const [subject, setSubject] = useState(task.subject)
  const [due, setDue] = useState(aInput(task.dueDate))

  const guardar = (): void => {
    if (!title.trim()) return
    onGuardar({ title, subject, due })
  }

  return (
    <div className="list-item editando">
      <div style={{ flex: 1 }}>
        <input
          type="text"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') guardar()
            if (e.key === 'Escape') onCancelar()
          }}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <input
            type="text"
            value={subject}
            placeholder="Asignatura"
            style={{ flex: 1 }}
            onChange={(e) => setSubject(e.target.value)}
          />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <button className="primary" onClick={guardar} disabled={!title.trim()}>
            Guardar
          </button>
          <button onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
