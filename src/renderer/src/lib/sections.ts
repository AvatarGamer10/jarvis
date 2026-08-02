/**
 * Las secciones de la app y su identidad en el anillo.
 *
 * Los colores de aqui viven SOLO en el menu radial. No entran en el contenido.
 *
 * Y todos son frios a proposito: el naranja y el rojo estan reservados a la
 * rampa de urgencia. Si una seccion se iluminara en naranja, competiria con
 * "esto vence hoy" y las dos senales perderian su significado.
 */

export type SectionId = 'chat' | 'agenda' | 'tareas' | 'carpetas' | 'ajustes'

export interface Section {
  id: SectionId
  label: string
  /** Frase corta que aparece bajo el logo al apuntar la seccion. */
  tagline: string
  color: string
}

export const SECTIONS: Section[] = [
  { id: 'chat', label: 'Chat', tagline: 'Pideme lo que necesites', color: '#3d8fd6' },
  { id: 'agenda', label: 'Agenda', tagline: 'Tu semana de un vistazo', color: '#8b6cf0' },
  { id: 'tareas', label: 'Tareas', tagline: 'Lo que tienes que entregar', color: '#29be9b' },
  { id: 'carpetas', label: 'Carpetas', tagline: 'Cada archivo en su sitio', color: '#d96ba8' },
  { id: 'ajustes', label: 'Ajustes', tagline: 'Cuentas y apariencia', color: '#7a8ca8' }
]

/**
 * Angulo de cada seccion en el circulo, empezando arriba.
 *
 * El CSS lo usa para colocar el elemento, y el centro para inclinarse hacia lo
 * que se esta apuntando.
 */
export function orbitAngle(index: number, total: number): number {
  return -90 + (360 / total) * index
}
