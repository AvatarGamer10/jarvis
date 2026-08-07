/**
 * Las secciones de la app y su identidad en el anillo.
 *
 * Los grises de aqui viven SOLO en el menu. No entran en el contenido.
 *
 * Ninguno llega al blanco puro a proposito: ese esta reservado a la rampa de
 * urgencia. Si una seccion se iluminara igual que "esto vence hoy", las dos
 * senales perderian su significado.
 */

export type SectionId = 'chat' | 'voz' | 'agenda' | 'tareas' | 'notas' | 'carpetas' | 'ajustes'

export interface Section {
  id: SectionId
  label: string
  /** Frase corta que aparece bajo el logo al apuntar la seccion. */
  tagline: string
  color: string
}

/** El orden manda: es el que siguen Ctrl+1..7 y el reparto en los aros. */
export const SECTIONS: Section[] = [
  { id: 'chat', label: 'Chat', tagline: 'Pideme lo que necesites', color: '#e4e4e4' },
  { id: 'voz', label: 'Voz', tagline: 'Hablame y te contesto', color: '#d2d2d2' },
  { id: 'agenda', label: 'Agenda', tagline: 'Tu semana de un vistazo', color: '#c0c0c0' },
  { id: 'tareas', label: 'Tareas', tagline: 'Lo que tienes que entregar', color: '#aeaeae' },
  { id: 'notas', label: 'Notas', tagline: 'Examenes y como vas', color: '#9c9c9c' },
  { id: 'carpetas', label: 'Carpetas', tagline: 'Cada archivo en su sitio', color: '#8a8a8a' },
  { id: 'ajustes', label: 'Ajustes', tagline: 'Cuentas y apariencia', color: '#787878' }
]
