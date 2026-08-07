import { useState } from 'react'
import { avisos } from '../lib/avisos'
import { paraInput } from '../lib/fechas'
import { sound } from '../lib/sound'

interface Propuesta {
  titulo: string
  asignatura: string
  /** Formato del <input type="date">, o vacio si no habia fecha. */
  entrega: string
  /** Desmarcada, no se crea. Empiezan todas marcadas. */
  marcada: boolean
}

interface Props {
  /** Se llama tras crear las tareas, para que la lista se recargue. */
  onCreadas: () => void | Promise<void>
}

/**
 * Pegar la lista de Classroom.
 *
 * El centro no aprueba la aplicacion y la API esta cerrada, pero copiar la
 * pantalla de Classroom y pegarla aqui funciona siempre. Recupera casi todo el
 * valor de la integracion sin depender de que nadie autorice nada.
 *
 * Lo interpretado se ensena para confirmar y se puede corregir antes de
 * guardar, igual que todo lo que la aplicacion escribe por su cuenta.
 */
export default function PegarClassroom({ onCreadas }: Props): JSX.Element {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null)
  const [fuente, setFuente] = useState<'modelo' | 'texto'>('texto')
  const [ocupado, setOcupado] = useState(false)

  const interpretar = async (): Promise<void> => {
    if (!texto.trim()) return
    setOcupado(true)

    const r = await window.jarvis.tasks.interpretarPegado(texto)
    if (r.ok) {
      setFuente(r.data.fuente)
      setPropuestas(
        r.data.tareas.map((t) => ({
          titulo: t.titulo,
          asignatura: t.asignatura,
          entrega: t.entrega ? paraInput(new Date(t.entrega)) : '',
          marcada: true
        }))
      )
      if (r.data.tareas.length === 0) {
        avisos.mostrar('No he sabido sacar ninguna tarea de ese texto.')
      }
    } else {
      avisos.error(r.error)
    }
    setOcupado(false)
  }

  const cambiar = (indice: number, cambios: Partial<Propuesta>): void => {
    setPropuestas((lista) =>
      lista === null ? null : lista.map((p, i) => (i === indice ? { ...p, ...cambios } : p))
    )
  }

  const marcadas = propuestas?.filter((p) => p.marcada && p.titulo.trim()) ?? []

  const crear = async (): Promise<void> => {
    setOcupado(true)

    // Una a una y no en lote: si una falla, las demas se crean igual y solo se
    // avisa de las que no han entrado.
    let creadas = 0
    const fallos: string[] = []
    for (const p of marcadas) {
      const r = await window.jarvis.tasks.add({
        title: p.titulo,
        subject: p.asignatura,
        dueDate: p.entrega ? new Date(`${p.entrega}T23:59`).toISOString() : null
      })
      if (r.ok) creadas++
      else fallos.push(p.titulo)
    }

    sound.play('confirm')
    avisos.mostrar(
      `${creadas} ${creadas === 1 ? 'tarea apuntada' : 'tareas apuntadas'}.` +
        (fallos.length > 0 ? ` No han entrado: ${fallos.join(', ')}.` : '')
    )

    cerrar()
    await onCreadas()
    setOcupado(false)
  }

  const cerrar = (): void => {
    setAbierto(false)
    setTexto('')
    setPropuestas(null)
  }

  if (!abierto) {
    return (
      <div className="pegar-lanzador">
        <button onClick={() => setAbierto(true)}>Pegar desde Classroom</button>
      </div>
    )
  }

  return (
    <div className="card">
      <h3>Pegar desde Classroom</h3>

      {propuestas === null ? (
        <>
          <p className="meta" style={{ marginTop: 0 }}>
            Abre Classroom, selecciona la lista de tareas, copiala y pegala aqui. No hace falta que
            quede limpio: de las cabeceras y los estados ya me encargo yo.
          </p>

          <textarea
            className="pegar-area"
            value={texto}
            autoFocus
            placeholder={
              'Ejercicios del tema 5\nMatematicas\nFecha de entrega: 8 ago\n\nComentario de texto\nLengua\nFecha de entrega: 10 ago'
            }
            onChange={(e) => setTexto(e.target.value)}
          />

          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={interpretar} disabled={ocupado || !texto.trim()}>
              {ocupado ? 'Leyendo…' : 'Ver que sale'}
            </button>
            <button onClick={cerrar} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="meta" style={{ marginTop: 0 }}>
            {propuestas.length === 0
              ? 'No he sabido sacar nada de ese texto.'
              : `${propuestas.length} ${propuestas.length === 1 ? 'tarea' : 'tareas'}. Aun no se ha creado nada: revisa y corrige lo que haga falta.`}
          </p>

          {propuestas.length > 0 && (
            <p className="hint" style={{ marginTop: 4 }}>
              {fuente === 'modelo'
                ? 'Interpretado por tu modelo local.'
                : 'Interpretado por reglas de texto, sin modelo. Revisa las asignaturas: es donde mas falla.'}
            </p>
          )}

          {propuestas.map((p, i) => (
            <div className="pegar-fila" key={i} data-fuera={!p.marcada}>
              <input
                type="checkbox"
                checked={p.marcada}
                aria-label={`Apuntar ${p.titulo}`}
                onChange={(e) => cambiar(i, { marcada: e.target.checked })}
              />
              <div className="pegar-campos">
                <input
                  type="text"
                  value={p.titulo}
                  placeholder="Que hay que hacer"
                  onChange={(e) => cambiar(i, { titulo: e.target.value })}
                />
                <div className="row">
                  <input
                    type="text"
                    value={p.asignatura}
                    placeholder="Asignatura"
                    style={{ flex: 1 }}
                    onChange={(e) => cambiar(i, { asignatura: e.target.value })}
                  />
                  <input
                    type="date"
                    value={p.entrega}
                    onChange={(e) => cambiar(i, { entrega: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="primary"
              onClick={crear}
              disabled={ocupado || marcadas.length === 0}
            >
              {marcadas.length === 1 ? 'Apuntar 1 tarea' : `Apuntar ${marcadas.length} tareas`}
            </button>
            <button onClick={() => setPropuestas(null)} disabled={ocupado}>
              Volver al texto
            </button>
            <button onClick={cerrar} disabled={ocupado}>
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
