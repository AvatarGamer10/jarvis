import type { CalendarEvent } from '@shared/types'
import type { GoogleApi } from './google-api'

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

interface GoogleEventTime {
  dateTime?: string
  date?: string
  timeZone?: string
}

interface GoogleEvent {
  id: string
  summary?: string
  location?: string
  htmlLink?: string
  start: GoogleEventTime
  end: GoogleEventTime
}

/** The machine's time zone. Google needs it to place events correctly. */
const localTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

function toEvent(raw: GoogleEvent): CalendarEvent {
  const allDay = !raw.start.dateTime
  return {
    id: raw.id,
    title: raw.summary ?? '(untitled)',
    start: raw.start.dateTime ?? raw.start.date ?? '',
    end: raw.end.dateTime ?? raw.end.date ?? '',
    allDay,
    location: raw.location,
    htmlLink: raw.htmlLink
  }
}

export class CalendarService {
  constructor(private readonly api: GoogleApi) {}

  async listEvents(timeMinIso: string, timeMaxIso: string): Promise<CalendarEvent[]> {
    const url = new URL(BASE)
    url.searchParams.set('timeMin', timeMinIso)
    url.searchParams.set('timeMax', timeMaxIso)
    // singleEvents expands repeating series into individual instances, which
    // is what the user wants to see; without it the parent event appears once.
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')

    const items = await this.api.listAll<GoogleEvent>(url.toString(), 'items')
    return items.map(toEvent)
  }

  async createEvent(input: {
    title: string
    start: string
    end: string
    description?: string
    location?: string
  }): Promise<CalendarEvent> {
    const timeZone = localTimeZone()
    const created = await this.api.post<GoogleEvent>(BASE, {
      summary: input.title,
      description: input.description,
      location: input.location,
      start: { dateTime: input.start, timeZone },
      end: { dateTime: input.end, timeZone }
    })
    return toEvent(created)
  }

  async moveEvent(eventId: string, start: string, end: string): Promise<CalendarEvent> {
    const timeZone = localTimeZone()
    const updated = await this.api.patch<GoogleEvent>(`${BASE}/${encodeURIComponent(eventId)}`, {
      start: { dateTime: start, timeZone },
      end: { dateTime: end, timeZone }
    })
    return toEvent(updated)
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.api.delete(`${BASE}/${encodeURIComponent(eventId)}`)
  }
}
