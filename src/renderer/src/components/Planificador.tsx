import { useState } from 'react'
import type { BloqueEstudio, PlanEstudio } from '@shared/types'
import { sound } from '../lib/sound'

const formatoDia = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'short'
})
const formatoHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

/**
 * Planificador con boton, sin pasar por el chat.
 *
 * La herramienta del agente solo funciona si Ollama esta levantado y si el
 * modelo acierta a elegirla. Esto funciona siempre, que para la funcion mas
 * util de la app es lo que corresponde.
 */
export default function Planificador(): JSX.Element {
  const [plan, setPlan] = useState<PlanEstudio | null>(null)
  const [dias, setDias] = useState(7)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'info' | 'error'; texto: string } | null>(null)

  const calcular = async (): Promise<void> => {
    setOcupado(true)
    setAviso(null)
    const r = await window.jarvis.plan.calcular(dias)
    if (r.ok) {
      setPlan(r.data)
      if (r.data.bloques.length === 0) {
        setAviso({
          tipo: 'info',
          texto: 'No hay nada que repartir: o no tienes tareas pendientes, o no quedan huecos.'
        })
      }
    } else {
      setAviso({ tipo: 'error', texto: r.error })
    }
    setOcupado(false)
  }

  const aplicar = async (): Promise<void> => {
    if (!plan) return
    setOcupado(true)
    const r = await window.jarvis.plan.aplicar(plan.id)
    if (r.ok) {
      sound.play('done')
      setAviso({
        tipo: r.data.fallos.length > 0 ? 'error' : 'info',
        texto:
          `${r.data.creados} bloque(s) en tu calendario.` +
          (r.data.fallos.length > 0 ? ` ${r.data.fallos.length} no se pudieron crear.` : '')
      })
      setPlan(null)
    } else {
      setAviso({ tipo: 'error', texto: r.error })
    }
    setOcupado(false)
  }

  // Agrupado por dia: una lista plana de veinte bloques no se lee.
  const porDia = new Map<string, BloqueEstudio[]>()
  for (const b of plan?.bloques ?? []) {
    const dia = formatoDia.format(new Date(b.inicio))
    const lista = porDia.get(dia)
    if (lista) lista.push(b)
    else porDia.set(dia, [b])
  }

  return (
    <div className="card">
      <h3>Planificar mi estudio</h3>

      {!plan && (
        <>
          <p className="meta" style={{ marginTop: 0 }}>
            Reparte tus tareas pendientes por los huecos libres del calendario. Lo mas urgente
            primero, y nunca despues de la fecha de entrega.
          </p>

          <div className="row" style={{ marginTop: 12 }}>
            {[3, 7, 14].map((d) => (
              <button key={d} className={d === dias ? 'primary' : ''} onClick={() => setDias(d)}>
                {d} dias
              </button>
            ))}
            <button onClick={calcular} disabled={ocupado} style={{ marginLeft: 'auto' }}>
              {ocupado ? 'Mirando tu semana…' : 'Ver propuesta'}
            </button>
          </div>
        </>
      )}

      {aviso && (
        <p className={`hint ${aviso.tipo === 'error' ? 'intro-error' : ''}`} style={{ marginTop: 10 }}>
          {aviso.texto}
        </p>
      )}

      {plan && plan.bloques.length > 0 && (
        <>
          <p className="meta" style={{ marginTop: 0 }}>
            {plan.bloques.length} bloque(s). Aun no se ha creado nada.
          </p>

          {[...porDia].map(([dia, bloques]) => (
            <div key={dia} style={{ marginTop: 12 }}>
              <div className="voz-quien" style={{ textTransform: 'capitalize' }}>
                {dia}
              </div>
              {bloques.map((b) => (
                <div className="list-item" key={b.inicio}>
                  <div>
                    <div>{b.tarea}</div>
                    {b.asignatura && <div className="meta">{b.asignatura}</div>}
                  </div>
                  <span className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {formatoHora.format(new Date(b.inicio))}–{formatoHora.format(new Date(b.fin))}
                  </span>
                </div>
              ))}
            </div>
          ))}

          <div className="row" style={{ marginTop: 14 }}>
            <button className="primary" onClick={aplicar} disabled={ocupado}>
              Anadirlos a mi calendario
            </button>
            <button onClick={() => setPlan(null)} disabled={ocupado}>
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
