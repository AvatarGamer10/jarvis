import { useEffect, useState } from 'react'
import type { BriefTask, DailyBrief } from '@shared/types'
import { dueLabel, urgencyOf } from '../lib/urgency'

/**
 * El resumen del dia, tal y como llega por la manana en la notificacion.
 *
 * Se carga en dos pasos: primero los datos, que son inmediatos, y despues la
 * redaccion del modelo, que con un modelo local puede tardar unos segundos.
 * Asi la tarjeta es util al instante en vez de quedarse en blanco esperando.
 */
export default function BriefCard(): JSX.Element | null {
  const [brief, setBrief] = useState<DailyBrief | null>(null)
  const [redactando, setRedactando] = useState(false)

  useEffect(() => {
    let cancelado = false

    void (async () => {
      const rapido = await window.jarvis.brief.get(false)
      if (cancelado || !rapido.ok) return
      setBrief(rapido.data)

      // Solo merece la pena pedir la redaccion si hay algo que contar.
      const hayAlgo =
        rapido.data.dueToday.length > 0 ||
        rapido.data.overdue.length > 0 ||
        rapido.data.events.length > 0
      if (!hayAlgo) return

      setRedactando(true)
      const completo = await window.jarvis.brief.get(true)
      if (cancelado) return
      if (completo.ok && completo.data.summary) setBrief(completo.data)
      setRedactando(false)
    })()

    return () => {
      cancelado = true
    }
  }, [])

  if (!brief) return null

  const nadaPendiente =
    brief.overdue.length === 0 && brief.dueToday.length === 0 && brief.dueSoon.length === 0

  const fila = (task: BriefTask, i: number): JSX.Element => (
    <div className="list-item" key={`${task.title}-${i}`} data-urgency={urgencyOf(task.dueDate)}>
      <div>
        <div>{task.title}</div>
        <div className="row" style={{ gap: 8, marginTop: 3 }}>
          <span className="due" data-urgency={urgencyOf(task.dueDate)}>
            {dueLabel(task.dueDate)}
          </span>
          {task.subject && <span className="meta">{task.subject}</span>}
        </div>
      </div>
      {task.source === 'classroom' && task.link && (
        <button onClick={() => void window.jarvis.shell.openExternal(task.link as string)}>
          Abrir
        </button>
      )}
    </div>
  )

  return (
    <div className="card brief">
      <h3>Hoy</h3>

      <p className="brief-headline">{brief.headline}</p>

      {brief.summary && <p className="brief-summary">{brief.summary}</p>}
      {redactando && !brief.summary && <p className="hint">Redactando el resumen…</p>}

      {nadaPendiente ? (
        <p className="empty" style={{ padding: '14px 0' }}>
          Sin entregas a la vista.
        </p>
      ) : (
        <>
          {brief.overdue.map(fila)}
          {brief.dueToday.map(fila)}
          {brief.dueSoon.map(fila)}
        </>
      )}
    </div>
  )
}
