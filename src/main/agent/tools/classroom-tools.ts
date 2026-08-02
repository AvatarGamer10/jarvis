import { z } from 'zod'
import type { Tool } from './types'

const listArgs = z.object({
  soloPendientes: z.boolean().optional()
})

export const classroomList: Tool<z.infer<typeof listArgs>> = {
  name: 'classroom_list_work',
  description:
    'Consulta las tareas del usuario en Google Classroom, con su asignatura, ' +
    'fecha de entrega y estado. Usala para responder que hay que entregar y cuando.',
  parameters: {
    type: 'OBJECT',
    properties: {
      soloPendientes: {
        type: 'BOOLEAN',
        description: 'Si es true, devuelve solo las tareas sin entregar. Por defecto true.'
      }
    },
    required: []
  },
  schema: listArgs,
  requiresConfirmation: false,
  async execute(args, ctx) {
    const onlyPending = args.soloPendientes ?? true
    const assignments = onlyPending
      ? await ctx.classroom.listPending()
      : await ctx.classroom.listAssignments()

    return {
      summary: `${assignments.length} tarea(s)${onlyPending ? ' pendiente(s)' : ''}.`,
      // Se manda lo minimo. El enunciado completo de la tarea no le hace falta
      // al modelo para contestar y son datos del colegio que no necesita ver.
      data: assignments.map((a) => ({
        titulo: a.title,
        asignatura: a.courseName,
        entrega: a.dueDate,
        diasRestantes: a.daysLeft,
        estado: a.state
      }))
    }
  }
}
