'use client'

import React from 'react'
import {
  Bot,
  CalendarDays,
  FolderTree,
  GraduationCap,
  ListChecks,
  Mic,
  NotebookPen,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import ParticleSphereAnimation from '@/components/ui/orbiting-circles-02-utils/particalsphear'

/**
 * Anillos de iconos girando alrededor de una esfera de particulas.
 *
 * Cambios respecto al componente original:
 *
 * 1. Los logos venian como <img> de images.shadcnspace.com. La CSP de la app
 *    empaquetada es `img-src 'self' data:`, asi que en el instalador no se
 *    verian: solo saldrian los aros vacios. Van como iconos de lucide, que se
 *    empaquetan dentro y ademas heredan el color.
 * 2. Recibe los anillos por props, para poder usarse como menu de la app y no
 *    solo como adorno. Sin props se comporta como el original.
 * 3. Anclaje `centro` ademas del original `abajo`. Como adorno esta bien que
 *    los iconos se hundan por debajo del borde media vuelta; como menu no,
 *    porque no se puede pulsar lo que no se ve.
 */

export interface OrbitaIcono {
  icon: LucideIcon
  label: string
  /** Posicion inicial en el aro, en grados. */
  angle: number
  /** Si se pasa, el icono es un boton. */
  onSelect?: () => void
  onHover?: (dentro: boolean) => void
  /** Se resalta como apuntado sin que el raton este encima (teclado). */
  active?: boolean
  /** Color del icono. Por defecto, el gris de texto secundario. */
  color?: string
  /** Para que quien lo use pueda mover el foco entre iconos. */
  ref?: (nodo: HTMLButtonElement | null) => void
  onKeyDown?: (evento: React.KeyboardEvent) => void
  tabIndex?: number
}

export interface Orbita {
  /** Clases de Tailwind con el diametro del aro. */
  size: string
  /** Segundos por vuelta. */
  duration: number
  icons: OrbitaIcono[]
}

interface Props {
  orbits?: Orbita[]
  /** Clases con el tamano de la esfera central. */
  sphereSize?: string
  /** `abajo` deja medio globo asomando; `centro` lo pone entero en pantalla. */
  anchor?: 'abajo' | 'centro'
  /** Contenido sobre la esfera. No recibe eventos. */
  children?: React.ReactNode
  /**
   * Duplica cada icono en el lado opuesto del aro. Queda mas lleno, pero en un
   * menu significa dos botones para el mismo sitio.
   */
  mirror?: boolean
  className?: string
}

const ORBITAS_POR_DEFECTO: Orbita[] = [
  {
    size: 'w-110 h-110 md:w-180 md:h-180',
    duration: 18,
    icons: [
      { icon: CalendarDays, label: 'Agenda', angle: -60 },
      { icon: Sparkles, label: 'Asistente', angle: 0 },
      { icon: ListChecks, label: 'Tareas', angle: 60 }
    ]
  },
  {
    size: 'w-150 h-150 md:w-220 md:h-220',
    duration: 24,
    icons: [
      { icon: NotebookPen, label: 'Notas', angle: 0 },
      { icon: Mic, label: 'Voz', angle: -90 }
    ]
  },
  {
    size: 'w-180 h-180 md:w-265 md:h-265',
    duration: 30,
    icons: [
      { icon: GraduationCap, label: 'Classroom', angle: -60 },
      { icon: Bot, label: 'Ollama', angle: 0 },
      { icon: FolderTree, label: 'Carpetas', angle: 60 }
    ]
  }
]

export default function OrbitingCircles({
  orbits = ORBITAS_POR_DEFECTO,
  sphereSize = 'w-75 md:w-145',
  anchor = 'abajo',
  children,
  mirror = true,
  className = ''
}: Props): JSX.Element {
  // Anclado abajo el centro cae en el borde inferior; centrado, en el medio.
  const centro =
    anchor === 'abajo'
      ? 'absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2'
      : 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'

  const alto = anchor === 'abajo' ? 'h-110 md:h-160' : 'h-full'

  return (
    <div
      className={`relative w-full ${alto} overflow-hidden flex justify-center ${className}`}
    >
      <style>{`
        @keyframes orbit-cw {
          from { transform: rotate(var(--start-angle)) }
          to   { transform: rotate(calc(var(--start-angle) + 360deg)) }
        }
        @keyframes orbit-ccw {
          from { transform: rotate(var(--start-angle)) }
          to   { transform: rotate(calc(var(--start-angle) - 360deg)) }
        }
        @keyframes counter-cw {
          from { transform: rotate(var(--counter-offset, 0deg)) }
          to   { transform: rotate(calc(var(--counter-offset, 0deg) - 360deg)) }
        }
        @keyframes counter-ccw {
          from { transform: rotate(var(--counter-offset, 0deg)) }
          to   { transform: rotate(calc(var(--counter-offset, 0deg) + 360deg)) }
        }
        @media (prefers-reduced-motion: reduce) {
          .orbita-brazo, .orbita-icono { animation: none !important }
        }
      `}</style>

      {/* Esfera de particulas en el centro */}
      <div
        className={`${centro} aspect-square pointer-events-none ${sphereSize} z-10`}
      >
        <ParticleSphereAnimation />
        {children}
      </div>

      {/* Anillos */}
      {orbits.map((orbit, index) => {
        const isCW = index % 2 === 0
        const orbitAnim = isCW ? 'orbit-cw' : 'orbit-ccw'
        const counterAnim = isCW ? 'counter-cw' : 'counter-ccw'

        const allIcons = mirror
          ? [
              ...orbit.icons,
              ...orbit.icons.map((ic) => ({
                ...ic,
                angle: ic.angle + 180,
                label: `${ic.label}-mirror`
              }))
            ]
          : orbit.icons

        return (
          <div
            key={index}
            className={`${centro} rounded-full border border-border ${orbit.size}`}
          >
            {allIcons.map((iconData, iconIndex) => {
              const Icono = iconData.icon
              const pulsable = typeof iconData.onSelect === 'function'

              const contenido = (
                <Icono
                  className="w-6 h-6 md:w-7 md:h-7"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              )

              const estiloIcono = {
                '--counter-offset': `${-iconData.angle}deg`,
                animation: `${counterAnim} ${orbit.duration}s linear infinite`,
                color: iconData.color
              } as React.CSSProperties

              const clases =
                'orbita-icono p-3 sm:p-4 border border-border rounded-full bg-background -mt-8 relative z-10'

              return (
                <div
                  key={iconIndex}
                  // El margen negativo centra el brazo sobre el aro y sigue al
                  // tamano real del icono en cada breakpoint. No se puede usar
                  // -translate-x-1/2: la animacion escribe transform y lo
                  // pisaria.
                  className="orbita-brazo absolute top-0 left-1/2 h-1/2 -ml-6 sm:-ml-7 md:-ml-8 origin-bottom flex flex-col justify-start items-center"
                  style={
                    {
                      '--start-angle': `${iconData.angle}deg`,
                      animation: `${orbitAnim} ${orbit.duration}s linear infinite`
                    } as React.CSSProperties
                  }
                >
                  {pulsable ? (
                    <button
                      type="button"
                      // Y este gira al reves para que el icono se quede derecho
                      // mientras el brazo da vueltas.
                      ref={iconData.ref}
                      className={clases}
                      style={estiloIcono}
                      data-activo={iconData.active ? 'true' : undefined}
                      aria-label={iconData.label.replace('-mirror', '')}
                      tabIndex={iconData.tabIndex}
                      onClick={iconData.onSelect}
                      onKeyDown={iconData.onKeyDown}
                      onMouseEnter={() => iconData.onHover?.(true)}
                      onMouseLeave={() => iconData.onHover?.(false)}
                      onFocus={() => iconData.onHover?.(true)}
                      onBlur={() => iconData.onHover?.(false)}
                    >
                      {contenido}
                    </button>
                  ) : (
                    <div className={`${clases} text-muted-foreground`} style={estiloIcono}>
                      {contenido}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
