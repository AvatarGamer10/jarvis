import type { CSSProperties } from 'react'
import { useRef, useState } from 'react'
import SectionIcon from '../components/SectionIcon'
import { orbitAngle, SECTIONS, type SectionId } from '../lib/sections'
import { sound } from '../lib/sound'

interface Props {
  onOpen: (id: SectionId) => void
}

/**
 * Menu radial: las secciones orbitan alrededor de la marca.
 *
 * Es la pantalla donde se aterriza, no un peaje de cada navegacion: desde
 * cualquier seccion se vuelve con Escape o pulsando la marca. Un menu circular
 * como navegacion permanente obliga a recorrer mas distancia con el raton cada
 * vez, y eso cansa en una app de uso diario.
 */
export default function Hub({ onOpen }: Props): JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null)
  const [hasMark, setHasMark] = useState(true)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const active = hovered === null ? null : SECTIONS[hovered]

  const open = (id: SectionId): void => {
    sound.play('nav')
    onOpen(id)
  }

  /** El anillo se recorre con las flechas, no solo con el raton. */
  const onKeyDown = (event: React.KeyboardEvent, index: number): void => {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!forward && !backward) return

    event.preventDefault()
    const next = (index + (forward ? 1 : -1) + SECTIONS.length) % SECTIONS.length
    buttons.current[next]?.focus()
    setHovered(next)
  }

  return (
    <div className="hub">
      <div className="orbit" onMouseLeave={() => setHovered(null)}>
        {/* Circunferencia de referencia: da cuerpo al anillo sin dibujar nada
            que compita con los iconos. */}
        <div
          className="orbit-track"
          style={{ borderColor: active ? `${active.color}55` : undefined }}
        />

        <div className="orbit-core">
          {hasMark ? (
            <img
              className="orbit-mark"
              src="./mark.png"
              alt=""
              onError={() => setHasMark(false)}
              // La marca se inclina hacia lo que estas apuntando: el centro
              // reacciona al anillo en vez de quedarse quieto.
              style={{
                transform:
                  hovered === null
                    ? undefined
                    : `rotate(${orbitAngle(hovered, SECTIONS.length) / 22}deg) scale(1.05)`,
                filter: active ? `drop-shadow(0 0 26px ${active.color}70)` : undefined
              }}
            />
          ) : (
            <div
              className="orbit-mark orbit-mark-text"
              style={{ color: active?.color, borderColor: active ? `${active.color}88` : undefined }}
            >
              J
            </div>
          )}

          <div className="orbit-caption">
            <strong style={{ color: active?.color }}>{active?.label ?? 'JARVIS'}</strong>
            <span>{active?.tagline ?? 'Elige por donde empezar'}</span>
          </div>
        </div>

        {SECTIONS.map((section, index) => {
          const isOn = hovered === index

          return (
            <button
              key={section.id}
              ref={(node) => {
                buttons.current[index] = node
              }}
              className={`orbit-item ${isOn ? 'is-on' : ''}`}
              style={
                {
                  // El sitio en la circunferencia lo resuelve el CSS a partir
                  // del angulo; aqui solo va el color y el retardo de entrada.
                  '--angle': `${orbitAngle(index, SECTIONS.length)}deg`,
                  color: isOn ? section.color : undefined,
                  borderColor: isOn ? `${section.color}99` : undefined,
                  boxShadow: isOn
                    ? `0 0 34px ${section.color}40, inset 0 0 18px ${section.color}18`
                    : undefined,
                  animationDelay: `${140 + index * 80}ms`
                } as CSSProperties
              }
              onMouseEnter={() => setHovered(index)}
              onFocus={() => setHovered(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={() => open(section.id)}
            >
              <SectionIcon id={section.id} />
              <span className="orbit-label">{section.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
