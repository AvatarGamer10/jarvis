import type { UndoBatch } from '@shared/types'
import { JsonStore } from '../store/json-store'

interface JournalData {
  batches: UndoBatch[]
}

/** How many batches are kept so they can be undone. */
const MAX_BATCHES = 20

/**
 * A record of what has been moved. It is what makes undo possible, and it is
 * why the organiser never deletes: there is always a way back.
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
