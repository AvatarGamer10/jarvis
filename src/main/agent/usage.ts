import { JsonStore } from '../store/json-store'

interface UsageData {
  /** Fecha local en formato YYYY-MM-DD del contador actual. */
  day: string
  calls: number
}

const today = (): string => {
  const now = new Date()
  // Fecha local, no UTC: el contador debe reiniciarse a medianoche del usuario.
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Cuenta las llamadas al modelo que se hacen cada dia.
 *
 * No es contabilidad exacta de cuota: es una senal para detectar que algo se ha
 * ido de madre (un bucle de herramientas descontrolado) antes de que agote el
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
