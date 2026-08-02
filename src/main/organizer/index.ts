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
 * Fachada del organizador. Guarda las reglas, calcula planes, los ejecuta y
 * mantiene el historial para deshacer.
 *
 * Los planes calculados se guardan en memoria y solo se pueden ejecutar por su
 * id: asi el renderer (o el agente) nunca puede pasar una lista de movimientos
 * inventada, solo aprobar una que se calculo aqui dentro.
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
    // Se valida al guardar, no solo al ejecutar: mejor rechazar una regla
    // imposible en el momento que crearla y que falle en silencio despues.
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

  /** Simulacro: calcula los movimientos sin tocar el disco. */
  plan(): MovePlan {
    const plan = planMoves(this.listRules(), this.roots())
    this.plans.set(plan.id, plan)

    // No dejamos crecer el mapa sin control en una sesion larga.
    if (this.plans.size > 10) {
      const oldest = [...this.plans.keys()][0]
      this.plans.delete(oldest)
    }
    return plan
  }

  apply(planId: string): ApplyOutcome {
    const plan = this.plans.get(planId)
    if (!plan) {
      throw new Error('Ese plan ya no existe. Vuelve a calcular la vista previa.')
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
    if (!batch) throw new Error('No hay nada que deshacer.')

    const outcome = undoBatch(batch, this.roots())
    // El lote se retira aunque algun archivo falle: lo que se pudo devolver ya
    // esta devuelto, y reintentar el resto moveria cosas dos veces.
    this.journal.remove(batch.id)
    return outcome
  }
}
