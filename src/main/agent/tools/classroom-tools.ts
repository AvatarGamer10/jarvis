import { z } from 'zod'
import type { Tool } from './types'

const listArgs = z.object({
  soloPendientes: z.boolean().optional()
})

export const classroomList: Tool<z.infer<typeof listArgs>> = {
  name: 'classroom_list_work',
  description:
    "Lists the user's assignments in Google Classroom, with their course, due date " +
    'and status. Use it to answer what has to be handed in and when.',
  parameters: {
    type: 'object',
    properties: {
      soloPendientes: {
        type: 'boolean',
        description: 'If true, only returns work that has not been handed in. Defaults to true.'
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
      summary: `${assignments.length} ${onlyPending ? 'open ' : ''}assignment${
        assignments.length === 1 ? '' : 's'
      }.`,
      // The bare minimum goes out. The model does not need the full brief of an
      // assignment to answer, and it is school data it has no business seeing.
      data: assignments.map((a) => ({
        title: a.title,
        subject: a.courseName,
        dueDate: a.dueDate,
        diasRestantes: a.daysLeft,
        estado: a.state
      }))
    }
  }
}
