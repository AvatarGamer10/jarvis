import { LOCALE, parseDate } from './dates'

/**
 * The brightness ramp, from white down into the background.
 *
 * This is the idea the whole interface rests on. Brightness does not
 * decorate, it encodes how much time is left. What is due today is the
 * brightest thing on screen; what is due next month has all but dissolved
 * into the background. The eye goes where it needs to go without reading a
 * single date.
 *
 * It is also why no button in Vilo is pure white. If "urgent" and "clickable"
 * were said at the same brightness, neither would mean anything. Clickable is
 * carried by the edge and the fill; urgent is carried by the light.
 */

export type Urgency = 'overdue' | 'today' | 'soon' | 'week' | 'far' | 'none'

/** Whole days remaining. Negative once it has passed. Null with no date. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null

  // Calendar days, not 24-hour windows: "tomorrow at 08:00" has to say one
  // day even when it is fifteen hours away.
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

/** Short label for a deadline. Reads faster than "12 March" ever will. */
export function dueLabel(iso: string | null): string {
  const days = daysUntil(iso)
  // `days` is only non-null when `iso` parsed, but the compiler cannot see
  // through daysUntil, so the narrowing is spelled out.
  if (days === null || iso === null) return 'No date'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${Math.abs(days)} days late`
  if (days <= 7) return `In ${days} days`

  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(
    parseDate(iso)
  )
}
