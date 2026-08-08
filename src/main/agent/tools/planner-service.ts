import { randomUUID } from 'node:crypto'
import type { StudyPlan } from '@shared/types'
import { planBlocks, type Block, type PlannerSources } from './planner-core'

/**
 * The planner, reachable from the interface without going through the chat.
 *
 * The agent's tool only helps if Ollama is running and the model happens to
 * pick it. This is the same thing behind a button: it always works, even with
 * no model at all.
 *
 * Calculated plans are held here and can only be applied by id, exactly as in
 * the folder organiser: that way the renderer cannot fabricate a list of
 * events and ask for them to be created.
 */
export class PlannerService {
  private readonly plans = new Map<string, Block[]>()

  constructor(private readonly sources: () => PlannerSources) {}

  async planBlocks(dias: number): Promise<StudyPlan> {
    const blocks = await planBlocks(dias, this.sources())
    const id = randomUUID()
    this.plans.set(id, blocks)

    // Not allowed to grow unchecked over a long session.
    if (this.plans.size > 10) {
      const antiguo = [...this.plans.keys()][0]
      this.plans.delete(antiguo)
    }

    return {
      id,
      blocks: blocks.map((b) => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        task: b.task,
        subject: b.subject
      }))
    }
  }

  async aplicar(
    planId: string,
    crear: (bloque: Block) => Promise<void>
  ): Promise<{ creados: number; fallos: string[] }> {
    const blocks = this.plans.get(planId)
    if (!blocks) {
      throw new Error('That plan no longer exists. Work it out again.')
    }
    this.plans.delete(planId)

    let creados = 0
    const fallos: string[] = []

    for (const b of blocks) {
      try {
        await crear(b)
        creados++
      } catch (err) {
        // One event failing must not bring down the rest of the plan.
        fallos.push((err as Error).message)
      }
    }

    return { creados, fallos }
  }
}
