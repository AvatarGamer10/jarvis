import { useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  FolderTree,
  ListChecks,
  MessageSquare,
  Mic,
  NotebookPen,
  Settings,
  type LucideIcon
} from 'lucide-react'
import OrbitingCircles, { type Orbita } from '../components/ui/orbiting-circles-02'
import { SECTIONS, type SectionId } from '../lib/sections'
import { sound } from '../lib/sound'

interface Props {
  onOpen: (id: SectionId) => void
}

const ICONOS: Record<SectionId, LucideIcon> = {
  chat: MessageSquare,
  voz: Mic,
  agenda: CalendarDays,
  tareas: ListChecks,
  notas: NotebookPen,
  carpetas: FolderTree,
  ajustes: Settings
}

/**
 * Reparto de las siete secciones en los tres aros.
 *
 * Las mas usadas van dentro, que es donde el raton llega antes; Ajustes queda
 * en el aro de fuera porque se abre una vez y no se vuelve.
 *
 * Los angulos separan los iconos de cada aro entre si. Que no coincidan de un
 * aro a otro es a proposito: los aros giran a velocidades distintas y, si
 * arrancaran alineados, cada pocos segundos se solaparian tres iconos en la
 * misma vertical.
 */
const REPARTO: { seccion: SectionId; angulo: number }[][] = [
  [
    { seccion: 'chat', angulo: -55 },
    { seccion: 'voz', angulo: 65 },
    { seccion: 'agenda', angulo: 185 }
  ],
  [
    { seccion: 'tareas', angulo: 20 },
    { seccion: 'notas', angulo: 200 }
  ],
  [
    { seccion: 'carpetas', angulo: -105 },
    { seccion: 'ajustes', angulo: 75 }
  ]
]

/**
 * Diametro de cada aro, en `vmin` y no en pixeles ni con breakpoints.
 *
 * Los breakpoints de Tailwind miran el ancho, y aqui manda el alto: en una
 * ventana de 1200x640 se aplicaria igualmente el tamano grande y el aro de
 * fuera se saldria por arriba justo cuando su icono pasa por el punto mas
 * alto. `vmin` sigue al lado corto, que es el que limita de verdad.
 *
 * El tope en pixeles evita que en un monitor muy grande el menu se vuelva
 * enorme y haya que cruzar media pantalla para pulsar un icono.
 */
const TAMANOS = [
  'w-[min(40vmin,340px)] h-[min(40vmin,340px)]',
  'w-[min(58vmin,494px)] h-[min(58vmin,494px)]',
  'w-[min(76vmin,646px)] h-[min(76vmin,646px)]'
]

/**
 * Segundos por vuelta. Van lentos a proposito: como adorno un giro rapido
 * queda bien, pero un boton que se mueve rapido es un boton dificil de pulsar.
 * Los aros de fuera recorren mas distancia, asi que tardan mas en dar la
 * vuelta y los tres se mueven a una velocidad parecida.
 */
const DURACIONES = [64, 86, 108]

/**
 * Pantalla de inicio: las secciones orbitan alrededor de la marca.
 *
 * Es donde se aterriza, no un peaje de cada navegacion: desde cualquier seccion
 * se vuelve con Escape o pulsando la marca, y quien ya sabe adonde va tiene
 * Ctrl+1..7 y la paleta.
 *
 * Los aros giran despacio a proposito. Como adorno un giro rapido queda bien;
 * como menu, un boton que se mueve rapido es un boton dificil de pulsar.
 */
export default function Hub({ onOpen }: Props): JSX.Element {
  const [apuntada, setApuntada] = useState<SectionId | null>(null)
  const [foco, setFoco] = useState(0)
  const botones = useRef<(HTMLButtonElement | null)[]>([])

  const activa = SECTIONS.find((s) => s.id === apuntada) ?? null

  const abrir = (id: SectionId): void => {
    sound.play('nav')
    onOpen(id)
  }

  /** El anillo se recorre con las flechas, no solo con el raton. */
  const alTeclear = (evento: React.KeyboardEvent, indice: number): void => {
    const adelante = evento.key === 'ArrowRight' || evento.key === 'ArrowDown'
    const atras = evento.key === 'ArrowLeft' || evento.key === 'ArrowUp'
    if (!adelante && !atras) return

    evento.preventDefault()
    const siguiente = (indice + (adelante ? 1 : -1) + SECTIONS.length) % SECTIONS.length
    setFoco(siguiente)
    botones.current[siguiente]?.focus()
  }

  const orbitas = useMemo<Orbita[]>(() => {
    let indice = 0

    return REPARTO.map((aro, i) => ({
      size: TAMANOS[i],
      duration: DURACIONES[i],
      icons: aro.map(({ seccion, angulo }) => {
        const datos = SECTIONS.find((s) => s.id === seccion)
        const propio = indice++

        return {
          icon: ICONOS[seccion],
          label: datos?.label ?? seccion,
          angle: angulo,
          color: apuntada === seccion ? undefined : datos?.color,
          active: apuntada === seccion,
          onSelect: () => abrir(seccion),
          onHover: (dentro: boolean) => setApuntada(dentro ? seccion : null),
          ref: (nodo: HTMLButtonElement | null) => {
            botones.current[propio] = nodo
          },
          onKeyDown: (evento: React.KeyboardEvent) => alTeclear(evento, propio),
          tabIndex: propio === foco ? 0 : -1
        }
      })
    }))
    // `abrir` y `alTeclear` no cambian de comportamiento entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apuntada, foco])

  return (
    <div className="hub">
      <OrbitingCircles
        orbits={orbitas}
        anchor="centro"
        sphereSize="w-[min(26vmin,230px)]"
        // Sin duplicados: cada seccion, un boton. Dos botones al mismo sitio
        // obligan a comprobar si de verdad van al mismo sitio.
        mirror={false}
      >
        <div className="orbita-marca">
          <strong style={{ color: activa?.color }}>{activa?.label ?? 'JARVIS'}</strong>
          <span>{activa?.tagline ?? 'Elige por donde empezar'}</span>
        </div>
      </OrbitingCircles>
    </div>
  )
}
