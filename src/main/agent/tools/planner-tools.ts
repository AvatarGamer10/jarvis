import { z } from 'zod'
import { planBlocks, type Block } from './planner-core'
import type { Tool } from './types'

/**
 * Spreads the outstanding work across the free gaps in the calendar.
 *
 * This is the feature that separates an assistant from a to-do list: we
 * already knew what you have to hand in and when, and what is in your
 * calendar. What was missing was crossing the two and saying *when* to do
 * each thing.
 *
 * The calculation lives in planner-core.ts so it can be tested without
 * average aplicacion.
 */

/** Nobody usefully plans more than a fortnight ahead. */
const DIAS_MAX = 14

const formatoDia = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'short'
})
const formatoHora = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

const args = z.object({
  dias: z.number().int().min(1).max(DIAS_MAX).optional()
})

/** The worked-out blocks travel with the arguments from prepare to execute. */
type Args = z.infer<typeof args> & { blocks?: Block[] }

export const planificarEstudio: Tool<Args> = {
  name: 'plan_study',
  description:
    'Spreads outstanding work into study blocks across the free gaps in the calendar. ' +
    'Use it when the user asks to get organised, plan the week, or work out when to study. ' +
    'It creates several events at once; the user confirms them.',
  parameters: {
    type: 'object',
    properties: {
      dias: {
        type: 'number',
        description: 'How many days ahead to plan. Defaults to 7.'
      }
    },
    required: []
  },
  schema: args,
  requiresConfirmation: true,

  // The distribution is worked out before asking, so the card can show the
  // actual blocks rather than an empty "I am going to plan".
  async prepare(data, ctx) {
    return { ...data, blocks: await planBlocks(data.dias ?? 7, ctx) }
  },

  describe(data) {
    const blocks = data.blocks ?? []
    if (blocks.length === 0) {
      return {
        description: 'Nothing to plan',
        details: ['Either there is no work outstanding, or there are no free gaps left.']
      }
    }

    return {
      description: `Add ${blocks.length} study block${
        blocks.length === 1 ? '' : 's'
      } to your calendar`,
      details: blocks.map(
        (b) =>
          `${formatoDia.format(b.start)} · ${formatoHora.format(b.start)}–${formatoHora.format(
            b.end
          )} · ${b.task}`
      )
    }
  },

  async execute(data, ctx) {
    const blocks = data.blocks ?? (await planBlocks(data.dias ?? 7, ctx))

    if (blocks.length === 0) {
      return {
        summary: 'There were no free gaps, or nothing is outstanding.',
        data: { creados: 0 }
      }
    }

    let creados = 0
    const fallos: string[] = []

    for (const b of blocks) {
      try {
        await ctx.calendar.createEvent({
          title: `Study: ${b.task}`,
          start: b.start.toISOString(),
          end: b.end.toISOString(),
          description: b.subject ? `Subject: ${b.subject}` : undefined
        })
        creados++
      } catch (err) {
        // One event failing must not take the rest of the plan down with it.
        fallos.push((err as Error).message)
      }
    }

    return {
      summary:
        `${creados} study block${creados === 1 ? '' : 's'} added to your calendar` +
        (fallos.length > 0 ? `, ${fallos.length} could not be created.` : '.'),
      data: { creados, fallos: fallos.slice(0, 2) }
    }
  }
}
