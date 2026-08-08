/**
 * Date formatting and the shortcuts that stop people opening a date picker.
 *
 * Almost everything anyone writes down is due today, tomorrow, on Friday, or
 * next week. Opening a calendar and hunting for the day is one gesture too
 * many, four times out of five.
 */

/**
 * One locale for the whole app.
 *
 * Vilo is English-first, and its users are on this side of the Atlantic, so
 * day-before-month and a 24-hour clock are what they expect to read. When the
 * language picker lands, this is the constant that follows it.
 */
export const LOCALE = 'en-GB'

const fmt = {
  time: new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false }),
  dayShort: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }),
  dayLong: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' }),
  weekday: new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }),
  full: new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }),
  month: new Intl.DateTimeFormat(LOCALE, { month: 'long' })
}

/** The format an <input type="date"> expects, in local time. */
export function toInputDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Parse an event date.
 *
 * All-day events arrive from Google as "2026-08-07" with no time, and
 * `new Date()` reads that as midnight UTC. West of Greenwich that lands them
 * on the previous day, so bare dates are built in local time instead.
 */
export function parseDate(iso: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!dateOnly) return new Date(iso)
  return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
}

export const timeOf = (iso: string): string => fmt.time.format(parseDate(iso))
export const shortDate = (iso: string): string => fmt.dayShort.format(parseDate(iso))
export const longDate = (iso: string): string => fmt.dayLong.format(parseDate(iso))
export const fullDate = (iso: string): string => fmt.full.format(parseDate(iso))
export const weekdayOf = (date: Date): string => fmt.weekday.format(date)
export const monthOf = (date: Date): string => fmt.month.format(date)

export interface DateShortcut {
  id: string
  label: string
  /** Ready to drop into an <input type="date">. */
  value: string
}

/**
 * The shortcuts that make sense today.
 *
 * Friday is dropped when it is already today or tomorrow: two buttons that do
 * the same thing under different names make people doubt that they really do
 * the same thing.
 */
export function dateShortcuts(today: Date = new Date()): DateShortcut[] {
  const base = new Date(today)
  base.setHours(0, 0, 0, 0)

  const shortcuts: DateShortcut[] = [
    { id: 'today', label: 'Today', value: toInputDate(base) },
    { id: 'tomorrow', label: 'Tomorrow', value: toInputDate(addDays(base, 1)) }
  ]

  // Next Friday counting from today. If today is Friday, that is today.
  const toFriday = (5 - base.getDay() + 7) % 7
  if (toFriday > 1) {
    shortcuts.push({
      id: 'friday',
      label: 'Friday',
      value: toInputDate(addDays(base, toFriday))
    })
  }

  shortcuts.push({ id: 'week', label: 'In a week', value: toInputDate(addDays(base, 7)) })

  return shortcuts
}
