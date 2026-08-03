import type { SettingsService } from '../store/settings'
import { nextOccurrence } from './next-occurrence'

/**
 * Dispara el resumen diario a la hora configurada.
 *
 * No usa una libreria de cron a proposito: es un unico disparo al dia y
 * `setTimeout` basta. Lo importante es recalcular la hora objetivo en cada
 * rearme en vez de sumar 24 horas, para que un cambio de horario de verano o
 * una suspension del portatil no lo vayan desplazando.
 */
export class BriefScheduler {
  private timer: NodeJS.Timeout | null = null
  /** Fecha (YYYY-MM-DD) del ultimo disparo, para no repetirlo. */
  private lastFired: string | null = null

  constructor(
    private readonly settings: SettingsService,
    private readonly onFire: () => void
  ) {}

  start(): void {
    this.arm()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Se llama al guardar ajustes: la hora puede haber cambiado. */
  reschedule(): void {
    this.stop()
    this.arm()
  }

  private arm(): void {
    const { dailyBriefEnabled, dailyBriefTime } = this.settings.all()
    if (!dailyBriefEnabled) return

    const next = nextOccurrence(dailyBriefTime)
    const delay = next.getTime() - Date.now()

    this.timer = setTimeout(() => {
      const today = next.toISOString().slice(0, 10)
      // Si el equipo estuvo suspendido, el temporizador puede despertar tarde y
      // varias veces; la marca del dia evita repetir el aviso.
      if (this.lastFired !== today) {
        this.lastFired = today
        try {
          this.onFire()
        } catch (err) {
          console.error('[brief] fallo al disparar el resumen:', err)
        }
      }
      this.arm()
    }, delay)
  }

}
