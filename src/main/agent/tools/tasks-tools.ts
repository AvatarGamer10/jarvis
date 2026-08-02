import { z } from 'zod'
import type { Tool } from './types'

/**
 * Herramientas de las tareas propias del usuario.
 *
 * Son las que siempre funcionan: no dependen de que Google ni el colegio
 * autoricen nada. Classroom, cuando esta disponible, se suma con su propia
 * herramienta de solo lectura.
 */

const listArgs = z.object({
  incluirHechas: z.boolean().optional()
})

export const tasksList: Tool<z.infer<typeof listArgs>> = {
  name: 'tasks_list',
  description:
    'Consulta las tareas que el usuario tiene apuntadas a mano en JARVIS, con su ' +
    'asignatura y fecha de entrega. Son sus tareas propias, distintas de las de Classroom.',
  parameters: {
    type: 'object',
    properties: {
      incluirHechas: {
        type: 'boolean',
        description: 'Si es true, incluye tambien las ya completadas. Por defecto false.'
      }
    },
    required: []
  },
  schema: listArgs,
  requiresConfirmation: false,
  async execute(args, ctx) {
    const all = ctx.tasks.list()
    const visible = args.incluirHechas ? all : all.filter((t) => !t.done)

    return {
      summary: `${visible.length} tarea(s) apuntada(s).`,
      data: visible.map((t) => ({
        titulo: t.title,
        asignatura: t.subject || null,
        entrega: t.dueDate,
        hecha: t.done
      }))
    }
  }
}

const addArgs = z.object({
  titulo: z.string().min(1, 'La tarea necesita un titulo.'),
  asignatura: z.string().optional(),
  entrega: z
    .string()
    .optional()
    .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), {
      message: 'La fecha de entrega no tiene un formato valido.'
    })
})

export const tasksAdd: Tool<z.infer<typeof addArgs>> = {
  name: 'tasks_add',
  description:
    'Apunta una tarea nueva. Usala cuando el usuario diga que tiene que entregar o hacer algo. ' +
    'El usuario lo confirmara en pantalla, asi que no preguntes tu antes.',
  parameters: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Que hay que hacer' },
      asignatura: { type: 'string', description: 'Asignatura, si se sabe' },
      entrega: { type: 'string', description: 'Fecha de entrega en ISO 8601, si se sabe' }
    },
    required: ['titulo']
  },
  schema: addArgs,
  requiresConfirmation: true,
  describe(args) {
    const details: string[] = []
    if (args.asignatura) details.push(`Asignatura: ${args.asignatura}`)
    if (args.entrega) {
      details.push(
        `Entrega: ${new Intl.DateTimeFormat('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        }).format(new Date(args.entrega))}`
      )
    } else {
      details.push('Sin fecha de entrega')
    }
    return { description: `Apuntar la tarea "${args.titulo}"`, details }
  },
  async execute(args, ctx) {
    const task = ctx.tasks.add({
      title: args.titulo,
      subject: args.asignatura,
      dueDate: args.entrega ?? null
    })
    return { summary: `Tarea "${task.title}" apuntada.`, data: { titulo: task.title } }
  }
}

const completeArgs = z.object({
  titulo: z.string().min(1, 'Dime que tarea marcar como hecha.')
})

export const tasksComplete: Tool<z.infer<typeof completeArgs>> = {
  name: 'tasks_complete',
  description:
    'Marca como hecha una tarea apuntada, buscandola por su titulo o parte de el. ' +
    'Solo funciona con las tareas propias, no con las de Classroom.',
  parameters: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Titulo de la tarea, o parte del mismo' }
    },
    required: ['titulo']
  },
  schema: completeArgs,
  requiresConfirmation: true,
  describe(args) {
    return {
      description: `Marcar como hecha la tarea "${args.titulo}"`,
      details: []
    }
  },
  async execute(args, ctx) {
    const found = ctx.tasks.findByTitle(args.titulo)
    if (!found) {
      // Se devuelve como dato, no como excepcion: asi el modelo puede
      // decirselo al usuario y ofrecerle la lista en vez de cortarse.
      return {
        summary: `No he encontrado ninguna tarea pendiente que se parezca a "${args.titulo}".`,
        data: { encontrada: false }
      }
    }
    ctx.tasks.update(found.id, { done: true })
    return { summary: `"${found.title}" marcada como hecha.`, data: { encontrada: true } }
  }
}
