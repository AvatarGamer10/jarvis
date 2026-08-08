import path from 'node:path'
import { z } from 'zod'
import type { Tool } from './types'

/**
 * The agent never gets given paths to move. It can only ask for a dry run and
 * then approve that plan by its id, which means it cannot fabricate a move
 * into an arbitrary folder however cleverly it is asked to.
 */

const noArgs = z.object({})

export const filesPlan: Tool<z.infer<typeof noArgs>> = {
  name: 'files_plan',
  description:
    'Works out which files the folder rules would move, without moving anything. ' +
    'Always use it before files_apply, and tell the user how many files there are.',
  parameters: { type: 'object', properties: {}, required: [] },
  schema: noArgs,
  requiresConfirmation: false,
  async execute(_args, ctx) {
    const plan = ctx.organizer.plan()
    if (plan.moves.length === 0) {
      return {
        summary: 'Nothing matches the current rules.',
        data: { planId: plan.id, movimientos: 0 }
      }
    }
    return {
      summary: `${plan.moves.length} file${plan.moves.length === 1 ? '' : 's'} would move.`,
      data: {
        planId: plan.id,
        movimientos: plan.moves.length,
        ejemplos: plan.moves.slice(0, 5).map((m) => ({
          archivo: path.basename(m.from),
          hacia: path.basename(path.dirname(m.to)),
          regla: m.rule
        }))
      }
    }
  }
}

const applyArgs = z.object({
  planId: z.string().min(1, 'You need the planId that files_plan returns.')
})

export const filesApply: Tool<z.infer<typeof applyArgs>> = {
  name: 'files_apply',
  description:
    'Applies a plan previously worked out by files_plan. This really does move ' +
    'files, so the user has to confirm it.',
  parameters: {
    type: 'object',
    properties: {
      planId: { type: 'string', description: 'The planId returned by files_plan' }
    },
    required: ['planId']
  },
  schema: applyArgs,
  requiresConfirmation: true,
  describe() {
    return {
      description: 'Run the folder tidy-up',
      details: ['Files move according to your rules.', 'You can undo it afterwards.']
    }
  },
  async execute(args, ctx) {
    const outcome = ctx.organizer.apply(args.planId)
    const failed = outcome.failed.length
    return {
      summary:
        `${outcome.moved.length} file${outcome.moved.length === 1 ? '' : 's'} moved` +
        (failed > 0 ? `, ${failed} with problems.` : '.'),
      data: {
        movidos: outcome.moved.length,
        fallidos: outcome.failed.map((f) => ({
          archivo: path.basename(f.move.from),
          motivo: f.error
        }))
      }
    }
  }
}

export const filesUndo: Tool<z.infer<typeof noArgs>> = {
  name: 'files_undo',
  description: 'Undoes the last batch of moved files, putting each one back where it was.',
  parameters: { type: 'object', properties: {}, required: [] },
  schema: noArgs,
  requiresConfirmation: true,
  describe() {
    return {
      description: 'Undo the last file move',
      details: ['Every file goes back to the folder it came from.']
    }
  },
  async execute(_args, ctx) {
    const outcome = ctx.organizer.undoLast()
    return {
      summary: `${outcome.moved.length} file${outcome.moved.length === 1 ? '' : 's'} put back.`,
      data: { devueltos: outcome.moved.length, fallidos: outcome.failed.length }
    }
  }
}
