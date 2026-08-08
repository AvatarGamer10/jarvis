import { z } from 'zod'
import type { Tool } from './types'

/**
 * Tools for the user's own tasks.
 *
 * These are the ones that always work: they do not depend on Google or the
 * school authorising anything. Classroom, when it is available, joins in
 * through its own read-only tool.
 */

const listArgs = z.object({
  incluirHechas: z.boolean().optional()
})

export const tasksList: Tool<z.infer<typeof listArgs>> = {
  name: 'tasks_list',
  description:
    'Lists the tasks the user has written down in Vilo, with their subject and due ' +
    'date. These are their own tasks, separate from the ones in Classroom.',
  parameters: {
    type: 'object',
    properties: {
      incluirHechas: {
        type: 'boolean',
        description: 'If true, also include completed ones. Defaults to false.'
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
      summary: `${visible.length} task${visible.length === 1 ? '' : 's'} written down.`,
      data: visible.map((t) => ({
        title: t.title,
        subject: t.subject || null,
        dueDate: t.dueDate,
        hecha: t.done
      }))
    }
  }
}

const addArgs = z.object({
  title: z.string().min(1, 'A task needs a title.'),
  subject: z.string().optional(),
  dueDate: z
    .string()
    .optional()
    .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), {
      message: 'That due date is not in a valid format.'
    })
})

export const tasksAdd: Tool<z.infer<typeof addArgs>> = {
  name: 'tasks_add',
  description:
    'Writes down a new task. Use it when the user says they have to hand in or do ' +
    'something. They confirm it on screen, so do not ask first.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'What needs doing' },
      subject: { type: 'string', description: 'Subject, if known' },
      dueDate: { type: 'string', description: 'Due date in ISO 8601, if known' }
    },
    required: ['title']
  },
  schema: addArgs,
  requiresConfirmation: true,
  describe(args) {
    const details: string[] = []
    if (args.subject) details.push(`Subject: ${args.subject}`)
    if (args.dueDate) {
      details.push(
        `Due: ${new Intl.DateTimeFormat('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        }).format(new Date(args.dueDate))}`
      )
    } else {
      details.push('No due date')
    }
    return { description: `Write down the task “${args.title}”`, details }
  },
  async execute(args, ctx) {
    const task = ctx.tasks.add({
      title: args.title,
      subject: args.subject,
      dueDate: args.dueDate ?? null
    })
    return { summary: `Task “${task.title}” added.`, data: { title: task.title } }
  }
}

const completeArgs = z.object({
  title: z.string().min(1, 'Tell me which task to tick off.')
})

export const tasksComplete: Tool<z.infer<typeof completeArgs>> = {
  name: 'tasks_complete',
  description:
    'Ticks off one of the user\'s own tasks, found by its title or part of it. ' +
    'It does not work on Classroom assignments.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The task title, or part of it' }
    },
    required: ['title']
  },
  schema: completeArgs,
  requiresConfirmation: true,
  describe(args) {
    return {
      description: `Tick off the task “${args.title}”`,
      details: []
    }
  },
  async execute(args, ctx) {
    const found = ctx.tasks.findByTitle(args.title)
    if (!found) {
      // Returned as data rather than thrown: that way the model can say so and
      // offer the list, instead of stopping dead.
      return {
        summary: `No open task looks like “${args.title}”.`,
        data: { encontrada: false }
      }
    }
    ctx.tasks.update(found.id, { done: true })
    return { summary: `“${found.title}” ticked off.`, data: { encontrada: true } }
  }
}
