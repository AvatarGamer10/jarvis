import { z } from 'zod'
import type { CalendarEvent } from '@shared/types'
import type { Tool } from './types'

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'La fecha no tiene un formato valido.' })

/** Version reducida del evento para mandarle al modelo: menos tokens, menos datos personales. */
const summarize = (e: CalendarEvent): Record<string, unknown> => ({
  id: e.id,
  titulo: e.title,
  inicio: e.start,
  fin: e.end,
  todoElDia: e.allDay
})

const formatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
})

// --- Listar ---------------------------------------------------------------

const listArgs = z.object({
  desde: isoDateTime,
  hasta: isoDateTime
})

export const calendarList: Tool<z.infer<typeof listArgs>> = {
  name: 'calendar_list',
  description:
    'Consulta los eventos del calendario del usuario en un rango de fechas. ' +
    'Usala siempre antes de proponer un hueco libre, para saber que hay ocupado.',
  parameters: {
    type: 'OBJECT',
    properties: {
      desde: { type: 'STRING', description: 'Inicio del rango en ISO 8601, por ejemplo 2026-08-03T00:00:00' },
      hasta: { type: 'STRING', description: 'Fin del rango en ISO 8601' }
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
      summary: `${events.length} evento(s) entre esas fechas.`,
      data: events.map(summarize)
    }
  }
}

// --- Crear ----------------------------------------------------------------

const createArgs = z
  .object({
    titulo: z.string().min(1, 'El evento necesita un titulo.'),
    inicio: isoDateTime,
    fin: isoDateTime,
    descripcion: z.string().optional()
  })
  .refine((v) => Date.parse(v.fin) > Date.parse(v.inicio), {
    message: 'El fin del evento debe ser posterior al inicio.'
  })

export const calendarCreate: Tool<z.infer<typeof createArgs>> = {
  name: 'calendar_create',
  description:
    'Crea un evento nuevo en el calendario. Sirve tambien para bloquear tiempo de estudio. ' +
    'El usuario tendra que confirmarlo, asi que no preguntes tu antes: llama directamente.',
  parameters: {
    type: 'OBJECT',
    properties: {
      titulo: { type: 'STRING', description: 'Titulo del evento' },
      inicio: { type: 'STRING', description: 'Inicio en ISO 8601' },
      fin: { type: 'STRING', description: 'Fin en ISO 8601' },
      descripcion: { type: 'STRING', description: 'Nota opcional' }
    },
    required: ['titulo', 'inicio', 'fin']
  },
  schema: createArgs,
  requiresConfirmation: true,
  describe(args) {
    return {
      description: `Crear el evento "${args.titulo}"`,
      details: [
        `Empieza: ${formatter.format(new Date(args.inicio))}`,
        `Termina: ${formatter.format(new Date(args.fin))}`,
        ...(args.descripcion ? [`Nota: ${args.descripcion}`] : [])
      ]
    }
  },
  async execute(args, ctx) {
    const event = await ctx.calendar.createEvent({
      title: args.titulo,
      start: new Date(args.inicio).toISOString(),
      end: new Date(args.fin).toISOString(),
      description: args.descripcion
    })
    return { summary: `Evento "${event.title}" creado.`, data: summarize(event) }
  }
}

// --- Mover ----------------------------------------------------------------

const moveArgs = z
  .object({
    eventoId: z.string().min(1),
    inicio: isoDateTime,
    fin: isoDateTime
  })
  .refine((v) => Date.parse(v.fin) > Date.parse(v.inicio), {
    message: 'El fin del evento debe ser posterior al inicio.'
  })

export const calendarMove: Tool<z.infer<typeof moveArgs>> = {
  name: 'calendar_move',
  description:
    'Cambia la fecha u hora de un evento que ya existe. Necesitas su id, ' +
    'asi que llama antes a calendar_list para localizarlo.',
  parameters: {
    type: 'OBJECT',
    properties: {
      eventoId: { type: 'STRING', description: 'Id del evento devuelto por calendar_list' },
      inicio: { type: 'STRING', description: 'Nuevo inicio en ISO 8601' },
      fin: { type: 'STRING', description: 'Nuevo fin en ISO 8601' }
    },
    required: ['eventoId', 'inicio', 'fin']
  },
  schema: moveArgs,
  requiresConfirmation: true,
  describe(args) {
    return {
      description: 'Mover un evento del calendario',
      details: [
        `Nuevo inicio: ${formatter.format(new Date(args.inicio))}`,
        `Nuevo fin: ${formatter.format(new Date(args.fin))}`
      ]
    }
  },
  async execute(args, ctx) {
    const event = await ctx.calendar.moveEvent(
      args.eventoId,
      new Date(args.inicio).toISOString(),
      new Date(args.fin).toISOString()
    )
    return { summary: `Evento "${event.title}" movido.`, data: summarize(event) }
  }
}
