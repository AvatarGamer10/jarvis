/**
 * Rampa de urgencia: del blanco al negro.
 *
 * Es la idea que sostiene toda la interfaz. El brillo no decora, codifica
 * cuanto tiempo queda. Lo de hoy es lo mas claro de la pantalla; lo del mes
 * que viene casi desaparece contra el fondo. Asi el ojo va solo a donde hay
 * que ir, sin leer una fecha.
 *
 * Por eso los botones no llegan al blanco puro: si "urgente" y "pulsable"
 * se dijeran con el mismo brillo, ninguno de los dos significaria nada. Lo
 * pulsable se reconoce por su borde y su relleno, no por lo claro que es.
 */

export type Urgency = 'overdue' | 'today' | 'soon' | 'week' | 'far' | 'none'

/** Dias naturales que faltan. Negativo si ya paso. Null si no hay fecha. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null

  // Se comparan dias del calendario, no franjas de 24 horas: "manana a las
  // 8:00" tiene que decir 1 dia aunque falten menos de 24.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(parsed)
  due.setHours(0, 0, 0, 0)

  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

export function urgencyOf(iso: string | null): Urgency {
  const days = daysUntil(iso)
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 2) return 'soon'
  if (days <= 7) return 'week'
  return 'far'
}

/** Texto corto para la fecha. Se lee antes que un "12 de marzo". */
export function dueLabel(iso: string | null): string {
  const days = daysUntil(iso)
  if (days === null) return 'Sin fecha'
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Manana'
  if (days === -1) return 'Ayer'
  if (days < 0) return `Hace ${Math.abs(days)} dias`
  if (days <= 7) return `En ${days} dias`

  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(
    new Date(iso as string)
  )
}
