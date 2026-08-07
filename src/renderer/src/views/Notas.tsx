import { useEffect, useState } from 'react'
import type { Examen, Necesario, ResumenAsignatura } from '@shared/types'
import { sound } from '../lib/sound'
import { dueLabel, urgencyOf } from '../lib/urgency'

/** Nota minima para aprobar. Se usa para colocar la marca de la barra. */
const APROBADO = 5
const NOTA_MAX = 10

const numero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })
const fechaLarga = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' })

const yaPaso = (e: Examen): boolean => {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Date.parse(e.date) < hoy.getTime()
}

/**
 * Examenes y notas.
 *
 * Vive aparte de Tareas porque responde a otra pregunta. Una tarea es "que
 * tengo que hacer" y desaparece al entregarla; un examen es "que tengo que
 * estudiar" primero y "como voy" despues, y no desaparece nunca porque cuenta
 * para la media.
 */
export default function Notas(): JSX.Element {
  const [examenes, setExamenes] = useState<Examen[]>([])
  const [resumen, setResumen] = useState<ResumenAsignatura[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [titulo, setTitulo] = useState('')
  const [asignatura, setAsignatura] = useState('')
  const [fecha, setFecha] = useState('')
  const [peso, setPeso] = useState('')

  const cargar = async (): Promise<void> => {
    const r = await window.jarvis.examenes.list()
    if (r.ok) {
      setExamenes(r.data.examenes)
      setResumen(r.data.resumen)
      setError(null)
    } else {
      setError(r.error)
    }
    setCargando(false)
  }

  useEffect(() => {
    void cargar()
  }, [])

  const apuntar = async (): Promise<void> => {
    if (!titulo.trim() || !fecha) return
    setGuardando(true)
    setError(null)

    const r = await window.jarvis.examenes.add({
      title: titulo,
      subject: asignatura,
      // A media manana: la hora concreta no se sabe, pero un examen no es a
      // las 00:00 y el planificador usa este instante como tope para estudiar.
      date: new Date(`${fecha}T09:00`).toISOString(),
      weight: peso ? Number(peso) : null
    })

    if (r.ok) {
      sound.play('confirm')
      setTitulo('')
      setAsignatura('')
      setFecha('')
      setPeso('')
      await cargar()
    } else {
      setError(r.error)
    }
    setGuardando(false)
  }

  const ponerNota = async (id: string, nota: number | null): Promise<void> => {
    const r = await window.jarvis.examenes.update(id, { grade: nota })
    if (r.ok) {
      if (nota !== null) sound.play('done')
      await cargar()
    } else {
      setError(r.error)
    }
  }

  const borrar = async (id: string): Promise<void> => {
    sound.play('cancel')
    await window.jarvis.examenes.remove(id)
    await cargar()
  }

  const pendientesDeNota = examenes.filter((e) => e.grade === null && yaPaso(e))
  const proximos = examenes.filter((e) => e.grade === null && !yaPaso(e))
  const hechos = examenes.filter((e) => e.grade !== null).reverse()

  return (
    <>
      <p className="page-subtitle">Cuando tienes cada examen y como llevas cada asignatura.</p>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h3>Apuntar un examen</h3>
        <div className="field">
          <label htmlFor="ex-titulo">Que examen es</label>
          <input
            id="ex-titulo"
            type="text"
            value={titulo}
            placeholder="Tema 4: cinematica"
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void apuntar()
            }}
          />
        </div>

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="ex-asignatura">Asignatura</label>
            <input
              id="ex-asignatura"
              type="text"
              value={asignatura}
              placeholder="Fisica"
              onChange={(e) => setAsignatura(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ex-fecha">Fecha</label>
            <input
              id="ex-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 96 }}>
            <label htmlFor="ex-peso">Cuenta un</label>
            <input
              id="ex-peso"
              type="number"
              min={1}
              max={100}
              value={peso}
              placeholder="%"
              onChange={(e) => setPeso(e.target.value)}
            />
          </div>
          <button
            className="primary"
            onClick={apuntar}
            disabled={guardando || !titulo.trim() || !fecha}
          >
            Apuntar
          </button>
        </div>
        <p className="hint">
          El peso es opcional, pero es lo que permite decirte que necesitas sacar en lo que queda.
        </p>
      </div>

      {cargando && <p className="empty">Cargando…</p>}

      {!cargando && (
        <>
          {pendientesDeNota.length > 0 && (
            <div className="card">
              <h3>Ya los has hecho: ¿que nota sacaste?</h3>
              {pendientesDeNota.map((e) => (
                <div className="list-item" key={e.id}>
                  <div>
                    <div>{e.title}</div>
                    <div className="row" style={{ gap: 8, marginTop: 3 }}>
                      <span className="mono">{fechaLarga.format(new Date(e.date))}</span>
                      {e.subject && <span className="meta">{e.subject}</span>}
                    </div>
                  </div>
                  <CampoNota onGuardar={(nota) => void ponerNota(e.id, nota)} />
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h3>Proximos ({proximos.length})</h3>
            {proximos.length === 0 ? (
              <p className="empty">Ningun examen a la vista. Disfrutalo.</p>
            ) : (
              proximos.map((e) => (
                <div className="list-item" key={e.id} data-urgency={urgencyOf(e.date)}>
                  <div>
                    <div>{e.title}</div>
                    <div className="row" style={{ gap: 8, marginTop: 3 }}>
                      <span className="due" data-urgency={urgencyOf(e.date)}>
                        {dueLabel(e.date)}
                      </span>
                      {e.subject && <span className="meta">{e.subject}</span>}
                      {e.weight !== null && <span className="badge dim">{e.weight}%</span>}
                    </div>
                  </div>
                  <button onClick={() => void borrar(e.id)}>Borrar</button>
                </div>
              ))
            )}
          </div>

          {resumen.length > 0 && (
            <div className="card">
              <h3>Como vas</h3>
              {resumen.map((r) => (
                <FilaAsignatura key={r.asignatura} resumen={r} />
              ))}
            </div>
          )}

          {hechos.length > 0 && (
            <div className="card">
              <h3>Hechos ({hechos.length})</h3>
              {hechos.map((e) => (
                <div className="list-item" key={e.id}>
                  <div>
                    <div>{e.title}</div>
                    <div className="row" style={{ gap: 8, marginTop: 3 }}>
                      <span className="mono">{fechaLarga.format(new Date(e.date))}</span>
                      {e.subject && <span className="meta">{e.subject}</span>}
                      {e.weight !== null && <span className="badge dim">{e.weight}%</span>}
                    </div>
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
                    <span className="nota mono">{numero.format(e.grade as number)}</span>
                    <button onClick={() => void ponerNota(e.id, null)}>Quitar nota</button>
                    <button onClick={() => void borrar(e.id)}>Borrar</button>
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
 * Campo para apuntar la nota de un examen ya hecho.
 *
 * Con su propio estado para que teclear no vuelva a pintar la lista entera en
 * cada pulsacion.
 */
function CampoNota({ onGuardar }: { onGuardar: (nota: number) => void }): JSX.Element {
  const [valor, setValor] = useState('')
  const numeroValido = valor !== '' && Number(valor) >= 0 && Number(valor) <= NOTA_MAX

  const guardar = (): void => {
    if (!numeroValido) return
    onGuardar(Number(valor))
    setValor('')
  }

  return (
    <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
      <input
        type="number"
        min={0}
        max={NOTA_MAX}
        step={0.1}
        value={valor}
        placeholder="0–10"
        style={{ width: 88 }}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') guardar()
        }}
      />
      <button className="primary" onClick={guardar} disabled={!numeroValido}>
        Guardar
      </button>
    </div>
  )
}

/**
 * Una asignatura con su media.
 *
 * La media se pinta como barra con una marca en el 5 en lugar de colorearla de
 * rojo o verde: el rojo y el naranja son de la rampa de urgencia y significan
 * "se acaba el tiempo". Si un suspenso tambien fuera rojo, el color dejaria de
 * querer decir nada. La posicion respecto a la marca se lee igual de rapido.
 */
function FilaAsignatura({ resumen }: { resumen: ResumenAsignatura }): JSX.Element {
  const { media, ponderada, hechos, pendientes, necesario } = resumen

  return (
    <div className="nota-fila">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{resumen.asignatura}</strong>
        <span className="nota mono">{media === null ? '—' : numero.format(media)}</span>
      </div>

      {media !== null && (
        <div className="nota-barra" style={{ '--marca': `${(APROBADO / NOTA_MAX) * 100}%` } as React.CSSProperties}>
          <div className="nota-barra-relleno" style={{ width: `${(media / NOTA_MAX) * 100}%` }} />
        </div>
      )}

      <div className="meta" style={{ marginTop: 5 }}>
        {hechos === 0
          ? `${pendientes} ${pendientes === 1 ? 'examen' : 'examenes'} por hacer`
          : `${hechos} ${hechos === 1 ? 'hecho' : 'hechos'}` +
            (pendientes > 0 ? `, ${pendientes} por hacer` : '') +
            (ponderada ? ' · media ponderada' : hechos > 1 ? ' · media simple' : '')}
      </div>

      {necesario && <p className="hint nota-necesario">{textoNecesario(necesario)}</p>}
    </div>
  )
}

function textoNecesario(n: Necesario): string {
  if (n.estado === 'asegurado') return 'Ya tienes el aprobado asegurado, saques lo que saques.'
  if (n.estado === 'imposible') return 'Con lo que queda ya no da para llegar al 5.'
  return `Necesitas un ${numero.format(n.nota)} de media en lo que queda para aprobar.`
}
