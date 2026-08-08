import type { CalendarEvent } from '@shared/types'
import { LOCALE, parseDate } from './dates'

/**
 * Arithmetic for the week grid.
 *
 * Kept out of the component because it is pure date maths, which is exactly
 * where the bugs hide: weeks that start on Sunday, events that cross midnight,
 * and two classes booked at the same hour.
 */

/** Default visible band. It widens if anything falls outside it. */
export const HOUR_MIN = 8
export const HOUR_MAX = 22

export interface PlacedEvent {
  event: CalendarEvent
  /** Minutes from the top of the visible band. */
  from: number
  /** Length in minutes. */
  length: number
  /** Which column inside its overlap group, and how many there are. */
  column: number
  columns: number
}

/** Monday of the week containing that date. */
export function mondayOf(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  // getDay() returns 0 for Sunday; here the week starts on Monday.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export function daysOfWeek(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })
}

export const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()

/**
 * Blocks the study planner created, recognised by their title.
 *
 * The Spanish prefix is still matched because events written to Google
 * Calendar by earlier versions are still sitting in people's calendars, and
 * they should keep rendering as study blocks rather than turning into
 * ordinary events overnight.
 */
export const isStudyBlock = (event: CalendarEvent): boolean =>
  event.title.startsWith('Study:') || event.title.startsWith('Estudiar:')

export const studyBlockTitle = (title: string): string =>
  title.replace(/^(Study|Estudiar):\s*/, '')

/**
 * Which hours to show.
 *
 * Starts at 08–22 and widens for anything outside, rather than always drawing
 * all 24: nobody has anything at four in the morning, and those empty rows
 * only squash the part of the day that matters.
 */
export function visibleBand(events: CalendarEvent[]): { start: number; end: number } {
  let start = HOUR_MIN
  let end = HOUR_MAX

  for (const event of events) {
    if (event.allDay) continue
    const from = parseDate(event.start)
    const to = parseDate(event.end)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) continue

    start = Math.min(start, from.getHours())
    // Ending exactly on the hour does not need the whole next row.
    const endHour = to.getMinutes() > 0 ? to.getHours() + 1 : to.getHours()
    if (sameDay(from, to)) end = Math.max(end, endHour)
  }

  return { start: Math.max(0, start), end: Math.min(24, Math.max(end, start + 4)) }
}

/**
 * Lay out one day, splitting overlapping events into columns.
 *
 * Without this, two classes at the same hour paint on top of each other and
 * only the last one is ever seen.
 */
export function placeDay(
  events: CalendarEvent[],
  day: Date,
  bandStart: number
): PlacedEvent[] {
  const ofDay = events
    .filter((e) => !e.allDay && sameDay(parseDate(e.start), day))
    .map((e) => {
      const from = parseDate(e.start)
      const to = parseDate(e.end)
      const startMin = from.getHours() * 60 + from.getMinutes()
      let endMin: number

      if (Number.isNaN(to.getTime())) {
        // With no usable end time, assume an hour rather than the rest of the day.
        endMin = startMin + 60
      } else if (!sameDay(to, day)) {
        // Crosses midnight: clipped to the end of the day. Without this its
        // height comes out negative and the event vanishes from the grid.
        endMin = 24 * 60
      } else {
        endMin = to.getHours() * 60 + to.getMinutes()
      }

      return {
        event: e,
        from: startMin - bandStart * 60,
        // Half an hour minimum: below that the title does not fit.
        length: Math.max(30, endMin - startMin)
      }
    })
    .sort((a, b) => a.from - b.from)

  // Column assignment: overlapping events are grouped, and the group closes
  // as soon as one arrives that touches none of them.
  const placed: PlacedEvent[] = []
  let group: typeof ofDay = []

  const closeGroup = (): void => {
    group.forEach((e, i) => placed.push({ ...e, column: i, columns: group.length }))
    group = []
  }

  for (const e of ofDay) {
    const overlaps = group.some((g) => e.from < g.from + g.length)
    if (group.length > 0 && !overlaps) closeGroup()
    group.push(e)
  }
  closeGroup()

  return placed
}

/**
 * All-day events covering that day.
 *
 * In Google the end of an all-day event is exclusive: a one-day event ends the
 * following day. Hence `<` rather than `<=`.
 */
export function allDayEvents(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => {
    if (!e.allDay) return false
    const from = parseDate(e.start)
    const to = parseDate(e.end)
    if (Number.isNaN(from.getTime())) return false
    if (Number.isNaN(to.getTime()) || to <= from) return sameDay(from, day)
    return day >= from && day < to
  })
}

/** Week title, without saying the month twice when it is the same one. */
export function weekTitle(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)

  const long = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' })
  const withYear = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  if (monday.getFullYear() !== sunday.getFullYear()) {
    return `${long.format(monday)} – ${withYear.format(sunday)}`
  }
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()} – ${long.format(sunday)}`
  }
  return `${long.format(monday)} – ${long.format(sunday)}`
}
