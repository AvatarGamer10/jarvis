import type { UndoBatch } from '@shared/types'
import { JsonStore } from '../store/json-store'

interface JournalData {
  batches: UndoBatch[]
}

/** Cuantos lotes se guardan para poder deshacer. */
const MAX_BATCHES = 20

/**
 * Registro de lo que se ha movido. Es lo que hace que "deshacer" sea posible,
 * y por eso el organizador nunca borra: siempre hay camino de vuelta.
 */
export class Journal {
  private readonly store: JsonStore<JournalData>

  constructor() {
    this.store = new JsonStore<JournalData>('organizer-journal.json', { batches: [] })
  }

  record(batch: UndoBatch): void {
    const batches = [batch, ...this.store.get().batches].slice(0, MAX_BATCHES)
    this.store.set({ batches })
  }

  list(): UndoBatch[] {
    return this.store.get().batches
  }

  last(): UndoBatch | null {
    return this.store.get().batches[0] ?? null
  }

  remove(batchId: string): void {
    this.store.set({ batches: this.store.get().batches.filter((b) => b.id !== batchId) })
  }
}
