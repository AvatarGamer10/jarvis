import { randomUUID } from 'node:crypto'
import type { FileRule, MovePlan, UndoBatch } from '@shared/types'
import { JsonStore } from '../store/json-store'
import type { SettingsService } from '../store/settings'
import { applyPlan, undoBatch, type ApplyOutcome } from './executor'
import { Journal } from './journal'
import { assertAllowed } from './paths'
import { planMoves } from './planner'

interface RulesData {
  rules: FileRule[]
}

/**
 * The organiser's front door. Stores the rules, calculates plans, runs them,
 * and keeps the history that makes undo possible.
 *
 * Calculated plans are held in memory and can only be executed by id: that way
 * the renderer — or the agent — can never hand over an invented list of moves,
 * only approve one that was calculated in here.
 */
export class OrganizerService {
  private readonly store: JsonStore<RulesData>
  private readonly journal = new Journal()
  private readonly plans = new Map<string, MovePlan>()

  constructor(private readonly settings: SettingsService) {
    this.store = new JsonStore<RulesData>('organizer-rules.json', { rules: [] })
  }

  private roots(): string[] {
    return this.settings.all().managedRoots
  }

  // --- Reglas -------------------------------------------------------------

  listRules(): FileRule[] {
    return this.store.get().rules
  }

  saveRule(rule: Omit<FileRule, 'id'> & { id?: string }): FileRule {
    // Validated on save, not only on execution: better to reject an impossible
    // rule there and then than to create it and have it fail quietly later.
    assertAllowed(this.roots(), rule.source)
    assertAllowed(this.roots(), rule.destination)

    const rules = [...this.store.get().rules]
    const saved: FileRule = { ...rule, id: rule.id ?? randomUUID() }

    const index = rules.findIndex((r) => r.id === saved.id)
    if (index >= 0) rules[index] = saved
    else rules.push(saved)

    this.store.set({ rules })
    return saved
  }

  deleteRule(id: string): void {
    this.store.set({ rules: this.store.get().rules.filter((r) => r.id !== id) })
  }

  // --- Planes -------------------------------------------------------------

  /** A dry run: works out the moves without touching the disk. */
  plan(): MovePlan {
    const plan = planMoves(this.listRules(), this.roots())
    this.plans.set(plan.id, plan)

    // The map is not allowed to grow unchecked over a long session.
    if (this.plans.size > 10) {
      const oldest = [...this.plans.keys()][0]
      this.plans.delete(oldest)
    }
    return plan
  }

  apply(planId: string): ApplyOutcome {
    const plan = this.plans.get(planId)
    if (!plan) {
      throw new Error('That plan no longer exists. Run the preview again.')
    }

    const outcome = applyPlan(plan, this.roots())
    this.plans.delete(planId)

    if (outcome.moved.length > 0) {
      this.journal.record({
        id: randomUUID(),
        appliedAt: new Date().toISOString(),
        moves: outcome.moved
      })
    }
    return outcome
  }

  // --- Deshacer -----------------------------------------------------------

  history(): UndoBatch[] {
    return this.journal.list()
  }

  undoLast(): ApplyOutcome {
    const batch = this.journal.last()
    if (!batch) throw new Error('There is nothing to undo.')

    const outcome = undoBatch(batch, this.roots())
    // The batch is retired even if a file fails: what could be put back has
    // been, and retrying the rest would move things twice.
    this.journal.remove(batch.id)
    return outcome
  }
}
