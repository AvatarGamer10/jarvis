import { z } from 'zod'
import type { CalendarEvent } from '@shared/types'
import type { Tool } from './types'

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'That date is not in a valid format.' })

/** Trimmed event for the model: fewer tokens, and less personal data leaving the app. */
const summarize = (e: CalendarEvent): Record<string, unknown> => ({
  id: e.id,
  title: e.title,
  inicio: e.start,
  fin: e.end,
  todoElDia: e.allDay
})

const formatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

// --- List ---------------------------------------------------------------

const listArgs = z.object({
  desde: isoDateTime,
  hasta: isoDateTime
})

export const calendarList: Tool<z.infer<typeof listArgs>> = {
  name: 'calendar_list',
  description:
    "Lists events in the user's calendar over a date range. Always use it before " +
    'proposing a free slot, so you know what is already taken.',
  parameters: {
    type: 'object',
    properties: {
      desde: { type: 'string', description: 'Start of the range in ISO 8601, e.g. 2026-08-03T00:00:00' },
      hasta: { type: 'string', description: 'End of the range in ISO 8601' }
    },
    required: ['desde', 'hasta']
  },
  schema: listArgs,
  requiresConfirmation: false,
  async execute(args, ctx) {
    const events = await ctx.calendar.listEvents(
      new Date(args.desde).toISOString(),
      new Date(args.hasta).toISOString()
    )
    return {
      summary: `${events.length} event${events.length === 1 ? '' : 's'} in that range.`,
      data: events.map(summarize)
    }
  }
}

// --- Create ----------------------------------------------------------------

const createArgs = z
  .object({
    title: z.string().min(1, 'An event needs a title.'),
    inicio: isoDateTime,
    fin: isoDateTime,
    descripcion: z.string().optional()
  })
  .refine((v) => Date.parse(v.fin) > Date.parse(v.inicio), {
    message: 'The event must end after it starts.'
  })

export const calendarCreate: Tool<z.infer<typeof createArgs>> = {
  name: 'calendar_create',
  description:
    'Creates a new calendar event. Also how you block out time to study. The user ' +
    'confirms it, so do not ask first: just call it.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Event title' },
      inicio: { type: 'string', description: 'Start, in ISO 8601' },
      fin: { type: 'string', description: 'End, in ISO 8601' },
      descripcion: { type: 'string', description: 'Optional note' }
    },
    required: ['title', 'inicio', 'fin']
  },
  schema: createArgs,
  requiresConfirmation: true,
  describe(args) {
    return {
      description: `Create the event “${args.title}”`,
      details: [
        `Starts: ${formatter.format(new Date(args.inicio))}`,
        `Ends: ${formatter.format(new Date(args.fin))}`,
        ...(args.descripcion ? [`Note: ${args.descripcion}`] : [])
      ]
    }
  },
  async execute(args, ctx) {
    const event = await ctx.calendar.createEvent({
      title: args.title,
      start: new Date(args.inicio).toISOString(),
      end: new Date(args.fin).toISOString(),
      description: args.descripcion
    })
    return { summary: `Event “${event.title}” created.`, data: summarize(event) }
  }
}

// --- Move ----------------------------------------------------------------

const moveArgs = z
  .object({
    eventoId: z.string().min(1),
    inicio: isoDateTime,
    fin: isoDateTime
  })
  .refine((v) => Date.parse(v.fin) > Date.parse(v.inicio), {
    message: 'The event must end after it starts.'
  })

export const calendarMove: Tool<z.infer<typeof moveArgs>> = {
  name: 'calendar_move',
  description:
    'Changes the date or time of an event that already exists. You need its id, ' +
    'so call calendar_list first to find it.',
  parameters: {
    type: 'object',
    properties: {
      eventoId: { type: 'string', description: 'The event id returned by calendar_list' },
      inicio: { type: 'string', description: 'New start, in ISO 8601' },
      fin: { type: 'string', description: 'New end, in ISO 8601' }
    },
    required: ['eventoId', 'inicio', 'fin']
  },
  schema: moveArgs,
  requiresConfirmation: true,
  describe(args) {
    return {
      description: 'Move a calendar event',
      details: [
        `New start: ${formatter.format(new Date(args.inicio))}`,
        `New end: ${formatter.format(new Date(args.fin))}`
      ]
    }
  },
  async execute(args, ctx) {
    const event = await ctx.calendar.moveEvent(
      args.eventoId,
      new Date(args.inicio).toISOString(),
      new Date(args.fin).toISOString()
    )
    return { summary: `Event “${event.title}” moved.`, data: summarize(event) }
  }
}
