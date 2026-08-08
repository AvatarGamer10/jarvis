import { JsonStore } from '../store/json-store'

interface UsageData {
  /** Local date, YYYY-MM-DD, of the current count. */
  day: string
  calls: number
}

const today = (): string => {
  const now = new Date()
  // Local date, not UTC: the count has to reset at the user's midnight.
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Counts the model calls made each day.
 *
 * Not exact quota accounting: it is a signal that something has got out of
 * hand — a runaway tool loop, say — before it burns through the
 * free tier.
 */
export class UsageCounter {
  private readonly store: JsonStore<UsageData>

  constructor() {
    this.store = new JsonStore<UsageData>('usage.json', { day: today(), calls: 0 })
  }

  record(): void {
    const data = this.store.get()
    if (data.day !== today()) {
      this.store.set({ day: today(), calls: 1 })
    } else {
      this.store.set({ calls: data.calls + 1 })
    }
  }

  callsToday(): number {
    const data = this.store.get()
    return data.day === today() ? data.calls : 0
  }
}
