import type { SectionId } from '../lib/sections'

/**
 * Iconos de seccion en SVG, pensados para moverse por dentro.
 *
 * No son emoji ni imagenes: cada uno tiene piezas con clase propia para que la
 * animacion ocurra dentro del dibujo (los puntos rebotan, el check se traza,
 * la carpeta se abre) en vez de limitarse a agrandar el conjunto entero.
 *
 * El movimiento lo dispara el CSS al apuntar el elemento del anillo, asi que
 * aqui no hay estado ni logica.
 */

const COMMON = {
  width: 26,
  height: 26,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

function ChatIcon(): JSX.Element {
  return (
    <svg {...COMMON} aria-hidden="true">
      <path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.3A7.5 7.5 0 1 1 20.5 11.5Z" />
      <circle className="ic-dot ic-dot-1" cx="8.5" cy="11.5" r="1.05" fill="currentColor" stroke="none" />
      <circle className="ic-dot ic-dot-2" cx="12" cy="11.5" r="1.05" fill="currentColor" stroke="none" />
      <circle className="ic-dot ic-dot-3" cx="15.5" cy="11.5" r="1.05" fill="currentColor" stroke="none" />
    </svg>
  )
}

function AgendaIcon(): JSX.Element {
  return (
    <svg {...COMMON} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path className="ic-ring" d="M8 3v3.4" />
      <path className="ic-ring" d="M16 3v3.4" />
      <rect className="ic-cell" x="7" y="12.5" width="4" height="3.5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TareasIcon(): JSX.Element {
  return (
    <svg {...COMMON} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path className="ic-check" d="m8 12.3 2.9 2.9L16.4 9.7" pathLength={1} />
    </svg>
  )
}

function CarpetasIcon(): JSX.Element {
  return (
    <svg {...COMMON} aria-hidden="true">
      <path d="M3.5 8.2a2 2 0 0 1 2-2h3.2l2 2.4h6.8a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2Z" />
      <path className="ic-lid" d="M3.9 11.4h16.2" />
    </svg>
  )
}

function AjustesIcon(): JSX.Element {
  return (
    <svg {...COMMON} aria-hidden="true">
      <g className="ic-gear">
        <circle cx="12" cy="12" r="3.1" />
        <path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2 5.4 5.4" />
      </g>
    </svg>
  )
}

function VozIcon(): JSX.Element {
  return (
    <svg {...COMMON} aria-hidden="true">
      <rect className="ic-capsula" x="9" y="2.6" width="6" height="11" rx="3" />
      <path d="M5.5 11.2a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.7v3.7" />
    </svg>
  )
}

function NotasIcon(): JSX.Element {
  return (
    <svg {...COMMON} aria-hidden="true">
      {/* Tres barras de altura distinta: la idea de "como voy" se lee antes en
          un grafico que en un boligrafo o un diploma. */}
      <path d="M3.6 20.4h16.8" />
      <rect className="ic-barra ic-barra-1" x="5.4" y="13" width="3.6" height="5.6" rx="1.2" fill="currentColor" stroke="none" />
      <rect className="ic-barra ic-barra-2" x="10.2" y="8.6" width="3.6" height="10" rx="1.2" fill="currentColor" stroke="none" />
      <rect className="ic-barra ic-barra-3" x="15" y="4.4" width="3.6" height="14.2" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

const ICONS: Record<SectionId, () => JSX.Element> = {
  chat: ChatIcon,
  voz: VozIcon,
  agenda: AgendaIcon,
  tareas: TareasIcon,
  notas: NotasIcon,
  carpetas: CarpetasIcon,
  ajustes: AjustesIcon
}

export default function SectionIcon({ id }: { id: SectionId }): JSX.Element {
  const Icon = ICONS[id]
  return <Icon />
}
