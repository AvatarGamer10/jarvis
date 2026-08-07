import { useEffect, useMemo, useRef, useState } from 'react'
import type { ManualTask } from '@shared/types'
import { SECTIONS, type SectionId } from '../lib/sections'
import { sound } from '../lib/sound'
import { dueLabel, urgencyOf } from '../lib/urgency'

interface Props {
  onIrA: (id: SectionId) => void
  onCerrar: () => void
}

interface Comando {
  id: string
  grupo: 'Ir a' | 'Acciones' | 'Tareas'
  etiqueta: string
  detalle?: string
  color?: string
  /** Marca de urgencia, solo para tareas. */
  urgencia?: string
  ejecutar: () => void | Promise<void>
}

/**
 * Paleta de comandos.
 *
 * El anillo es bonito pero cuesta dos gestos para todo: Escape y clic. Esto
 * es la via rapida para quien ya sabe lo que quiere, sin quitarle al anillo su
 * papel de pantalla de inicio.
 *
 * Busca sin acentos y sin mayusculas, igual que el buscador de tareas: quien
 * escribe "fisica" espera encontrar "Fisica".
 */
export default function Paleta({ onIrA, onCerrar }: Props): JSX.Element {
  const [texto, setTexto] = useState('')
  const [indice, setIndice] = useState(0)
  const [tareas, setTareas] = useState<ManualTask[]>([])
  const entrada = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    entrada.current?.focus()
    void window.jarvis.tasks.list().then((r) => {
      if (r.ok) setTareas(r.data.filter((t) => !t.done))
    })
  }, [])

  const normalizar = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')

  const comandos = useMemo<Comando[]>(() => {
    const irA: Comando[] = SECTIONS.map((s) => ({
      id: `ir-${s.id}`,
      grupo: 'Ir a',
      etiqueta: s.label,
      detalle: s.tagline,
      color: s.color,
      ejecutar: () => onIrA(s.id)
    }))

    const acciones: Comando[] = [
      {
        id: 'planificar',
        grupo: 'Acciones',
        etiqueta: 'Planificar mi estudio',
        detalle: 'Reparte tus tareas por los huecos libres',
        ejecutar: () => onIrA('agenda')
      },
      {
        id: 'apuntar',
        grupo: 'Acciones',
        etiqueta: 'Apuntar una tarea',
        detalle: 'Ir a Tareas',
        ejecutar: () => onIrA('tareas')
      },
      {
        id: 'hablar',
        grupo: 'Acciones',
        etiqueta: 'Hablar con JARVIS',
        detalle: 'Abrir la seccion de voz',
        ejecutar: () => onIrA('voz')
      },
      {
        id: 'flotante',
        grupo: 'Acciones',
        etiqueta: 'Boton flotante',
        detalle: 'Mostrarlo u ocultarlo · Ctrl+Alt+J',
        ejecutar: async () => {
          await window.jarvis.hud.toggle()
        }
      }
    ]

    const deTareas: Comando[] = tareas.map((t) => ({
      id: `tarea-${t.id}`,
      grupo: 'Tareas',
      etiqueta: t.title,
      detalle: [t.subject, dueLabel(t.dueDate)].filter(Boolean).join(' · '),
      urgencia: urgencyOf(t.dueDate),
      ejecutar: () => onIrA('tareas')
    }))

    return [...acciones, ...irA, ...deTareas]
  }, [tareas, onIrA])

  const aguja = normalizar(texto.trim())
  const filtrados = useMemo(() => {
    if (!aguja) {
      // Sin escribir nada se ensena lo util, no la lista entera.
      return comandos.filter((c) => c.grupo !== 'Tareas').slice(0, 10)
    }
    return comandos
      .filter((c) => normalizar(`${c.etiqueta} ${c.detalle ?? ''}`).includes(aguja))
      .slice(0, 12)
  }, [comandos, aguja])

  // Al cambiar el filtro, la seleccion vuelve arriba: mantenerla apuntando a
  // una fila que ya no existe hace que Enter ejecute algo inesperado.
  useEffect(() => setIndice(0), [aguja])

  const ejecutar = (c: Comando | undefined): void => {
    if (!c) return
    sound.play('nav')
    void c.ejecutar()
    onCerrar()
  }

  const alPulsar = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndice((i) => Math.min(i + 1, filtrados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndice((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ejecutar(filtrados[indice])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCerrar()
    }
  }

  // Mantiene visible la fila seleccionada al moverse con el teclado.
  useEffect(() => {
    lista.current?.querySelector('.paleta-fila.activa')?.scrollIntoView({ block: 'nearest' })
  }, [indice])

  let grupoAnterior = ''

  return (
    <div className="paleta-fondo" onMouseDown={onCerrar}>
      <div className="paleta" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={entrada}
          type="text"
          value={texto}
          placeholder="Busca una tarea o escribe una accion…"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alPulsar}
        />

        <div className="paleta-lista" ref={lista}>
          {filtrados.length === 0 && <p className="empty">Nada que coincida.</p>}

          {filtrados.map((c, i) => {
            const cabecera = c.grupo !== grupoAnterior ? c.grupo : null
            grupoAnterior = c.grupo

            return (
              <div key={c.id}>
                {cabecera && <div className="paleta-grupo">{cabecera}</div>}
                <button
                  className={`paleta-fila ${i === indice ? 'activa' : ''}`}
                  onMouseEnter={() => setIndice(i)}
                  onClick={() => ejecutar(c)}
                >
                  <span className="paleta-punto" style={{ background: c.color }} data-urgencia={c.urgencia} />
                  <span className="paleta-texto">
                    <strong>{c.etiqueta}</strong>
                    {c.detalle && <span>{c.detalle}</span>}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        <div className="paleta-pie">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> moverse
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> cerrar
          </span>
        </div>
      </div>
    </div>
  )
}
