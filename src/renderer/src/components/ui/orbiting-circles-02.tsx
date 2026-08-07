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
 * Dos cambios respecto al componente original:
 *
 * 1. Los logos venian como <img> de images.shadcnspace.com. La CSP de la app
 *    empaquetada es `img-src 'self' data:`, asi que en el instalador no se
 *    verian: solo saldrian los aros vacios. Van como iconos de lucide, que se
 *    empaquetan dentro y ademas heredan el color.
 * 2. Los iconos son los de JARVIS y no los de un stack cualquiera. Un anillo de
 *    logos de Supabase y Figma en una aplicacion de instituto no dice nada.
 *
 * La estructura, los tamanos, las duraciones y los angulos son los del
 * original.
 */

interface IconoOrbita {
  icon: LucideIcon
  alt: string
  angle: number
}

interface Orbita {
  size: string
  duration: number
  icons: IconoOrbita[]
}

const orbits: Orbita[] = [
  {
    size: 'w-110 h-110 md:w-180 md:h-180',
    duration: 18,
    icons: [
      { icon: CalendarDays, alt: 'Agenda', angle: -60 },
      { icon: Sparkles, alt: 'Asistente', angle: 0 },
      { icon: ListChecks, alt: 'Tareas', angle: 60 }
    ]
  },
  {
    size: 'w-150 h-150 md:w-220 md:h-220',
    duration: 24,
    icons: [
      { icon: NotebookPen, alt: 'Notas', angle: 0 },
      { icon: Mic, alt: 'Voz', angle: -90 }
    ]
  },
  {
    size: 'w-180 h-180 md:w-265 md:h-265',
    duration: 30,
    icons: [
      { icon: GraduationCap, alt: 'Classroom', angle: -60 },
      { icon: Bot, alt: 'Ollama', angle: 0 },
      { icon: FolderTree, alt: 'Carpetas', angle: 60 }
    ]
  }
]

export default function OrbitingCirclesGlobeDemo(): JSX.Element {
  return (
    <div className="relative w-full h-110 md:h-160 overflow-hidden flex justify-center">
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
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 aspect-square pointer-events-none w-75 md:w-145 z-10">
        <ParticleSphereAnimation />
      </div>

      {/* Anillos */}
      {orbits.map((orbit, index) => {
        const isCW = index % 2 === 0
        const orbitAnim = isCW ? 'orbit-cw' : 'orbit-ccw'
        const counterAnim = isCW ? 'counter-cw' : 'counter-ccw'

        // Cada icono se duplica en el lado opuesto del aro para que el anillo
        // no se vea vacio por detras.
        const allIcons = [
          ...orbit.icons,
          ...orbit.icons.map((ic) => ({
            ...ic,
            angle: ic.angle + 180,
            alt: `${ic.alt}-mirror`
          }))
        ]

        return (
          <div
            key={index}
            className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-border ${orbit.size}`}
          >
            {allIcons.map((iconData, iconIndex) => {
              const Icono = iconData.icon

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
                  <div
                    // Y este gira al reves para que el icono se quede derecho
                    // mientras el brazo da vueltas.
                    className="orbita-icono p-3 sm:p-4 border border-border rounded-full bg-background -mt-8 relative z-10"
                    style={
                      {
                        '--counter-offset': `${-iconData.angle}deg`,
                        animation: `${counterAnim} ${orbit.duration}s linear infinite`
                      } as React.CSSProperties
                    }
                  >
                    <Icono
                      className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground"
                      strokeWidth={1.6}
                      aria-label={iconData.alt}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
