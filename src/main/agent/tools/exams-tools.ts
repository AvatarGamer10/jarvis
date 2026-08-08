import { z } from 'zod'
import { GRADE_MAX, GRADE_MIN, bySubject, upcoming } from '../../tasks/grades-core'
import type { Tool } from './types'

/**
 * Tools for exams and grades.
 *
 * Kept apart from the task tools because they answer different questions:
 * tasks are "what do I have to do", exams are "what do I have to study" and
 * "how am I doing". The model picks better from two clear groups than from one
 * large one.
 */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
})

const listArgs = z.object({
  soloProximos: z.boolean().optional()
})

export const examsList: Tool<z.infer<typeof listArgs>> = {
  name: 'exams_list',
  description:
    "Lists the user's exams and marks, with the average per subject. Use it when " +
    'they ask about exams, how a subject is going, or their average.',
  parameters: {
    type: 'object',
    properties: {
      soloProximos: {
        type: 'boolean',
        description: 'If true, only the ones still to come. Defaults to false.'
      }
    },
    required: []
  },
  schema: listArgs,
  requiresConfirmation: false,
  async execute(args, ctx) {
    const todos = ctx.exams.list()
    const visibles = args.soloProximos ? upcoming(todos) : todos

    return {
      summary: args.soloProximos
        ? `${visibles.length} exam${visibles.length === 1 ? '' : 's'} still to come.`
        : `${visibles.length} exam${visibles.length === 1 ? '' : 's'} on record.`,
      data: {
        exams: visibles.map((e) => ({
          title: e.title,
          subject: e.subject || null,
          fecha: e.date,
          grade: e.grade,
          peso: e.weight
        })),
        // The average always goes along: if someone asks about their exams, the
        // next question is how they are doing, and this saves a second round trip.
        bySubject: bySubject(todos).map((r) => ({
          subject: r.subject,
          average: r.average,
          weighted: r.weighted,
          done: r.done,
          pending: r.pending,
          necesarioParaAprobar: r.needed
        }))
      }
    }
  }
}

const addArgs = z.object({
  title: z.string().min(1, 'An exam needs a title.'),
  subject: z.string().optional(),
  fecha: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'That exam date is not in a valid format.'
  }),
  peso: z.number().min(1).max(100).optional()
})

export const examsAdd: Tool<z.infer<typeof addArgs>> = {
  name: 'exams_add',
  description:
    'Records an exam with its date. Use it when the user says they have an exam, ' +
    'test or assessment. They confirm it on screen, so do not ask first.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Exam name, or what it covers' },
      subject: { type: 'string', description: 'Subject, if known' },
      fecha: { type: 'string', description: 'Exam date in ISO 8601' },
      peso: {
        type: 'number',
        description: 'How much it counts towards the term mark, as a percentage'
      }
    },
    required: ['title', 'fecha']
  },
  schema: addArgs,
  requiresConfirmation: true,
  describe(args) {
    const details = [`Date: ${dateFormat.format(new Date(args.fecha))}`]
    if (args.subject) details.unshift(`Subject: ${args.subject}`)
    if (args.peso) details.push(`Worth ${args.peso}% of the term`)
    return { description: `Record the exam “${args.title}”`, details }
  },
  async execute(args, ctx) {
    const exam = ctx.exams.add({
      title: args.title,
      subject: args.subject,
      date: args.fecha,
      weight: args.peso ?? null
    })
    return { summary: `Exam “${exam.title}” recorded.`, data: { title: exam.title } }
  }
}

const gradeArgs = z.object({
  exam: z.string().min(1, 'Tell me which exam the mark is for.'),
  grade: z.number().min(GRADE_MIN).max(GRADE_MAX)
})

export const examsGrade: Tool<z.infer<typeof gradeArgs>> = {
  name: 'exams_grade',
  description:
    'Records the mark for an exam already sat, found by its title or subject. ' +
    `Marks run from ${GRADE_MIN} to ${GRADE_MAX}.`,
  parameters: {
    type: 'object',
    properties: {
      exam: { type: 'string', description: 'Exam title or subject' },
      grade: { type: 'number', description: `The mark, from ${GRADE_MIN} to ${GRADE_MAX}` }
    },
    required: ['exam', 'grade']
  },
  schema: gradeArgs,
  requiresConfirmation: true,
  describe(args) {
    return {
      description: `Record a ${args.grade} for “${args.exam}”`,
      details: ['This changes your average for that subject']
    }
  },
  async execute(args, ctx) {
    const encontrado = ctx.exams.findByText(args.exam)
    if (!encontrado) {
      // As data rather than an exception: that way the model can say so and
      // offer the list, instead of stopping dead.
      return {
        summary: `No exam looks like “${args.exam}”.`,
        data: { encontrado: false }
      }
    }

    ctx.exams.update(encontrado.id, { grade: args.grade })
    const summary = bySubject(ctx.exams.list()).find(
      (r) => r.subject.toLowerCase() === encontrado.subject.trim().toLowerCase()
    )

    return {
      summary:
        `A ${args.grade} for “${encontrado.title}”.` +
        (summary?.average !== null && summary !== undefined
          ? ` ${summary.subject} average is now ${summary.average}.`
          : ''),
      data: { encontrado: true, average: summary?.average ?? null }
    }
  }
}
