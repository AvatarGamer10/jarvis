import type { SettingsService } from '../store/settings'
import { nextOccurrence } from './next-occurrence'

/**
 * Fires the morning brief at the configured time.
 *
 * Deliberately not a cron library: it is one shot a day and `setTimeout` is
 * enough. What matters is recalculating the target time on every rearm rather
 * than adding 24 hours, so that a daylight-saving change or the laptop being
 * suspended does not drift it.
 */
export class BriefScheduler {
  private timer: NodeJS.Timeout | null = null
  /** Date (YYYY-MM-DD) of the last firing, so it is not repeated. */
  private lastFired: string | null = null

  constructor(
    private readonly settings: SettingsService,
    private readonly onFire: () => void
  ) {}

  start(): void {
    this.recuperarPerdido()
    this.arm()
  }

  /**
   * Fires the brief if it was due today and never went out.
   *
   * Without this, a day on which the app was not open at 7:30 skipped the
   * notification and nobody noticed it was missing. A school day's brief is
   * useful all day, not only at its exact hour.
   */
  private recuperarPerdido(): void {
    const { dailyBriefEnabled, dailyBriefTime, lastBriefDate } = this.settings.all()
    if (!dailyBriefEnabled) return

    const today = new Date().toISOString().slice(0, 10)
    if (lastBriefDate === today) return

    // Solo si la hora de today ya paso; si aun no ha llegado, ya saltara sola.
    const objetivo = nextOccurrence(dailyBriefTime)
    const yaPaso = objetivo.toISOString().slice(0, 10) !== today

    if (!yaPaso) return

    this.lastFired = today
    this.settings.update({ lastBriefDate: today })
    try {
      this.onFire()
    } catch (err) {
      console.error('[brief] failed to catch up on the day\u2019s brief:', err)
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Called when settings are saved: the time may have changed. */
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
      // If the machine was asleep the timer can wake late and more than once;
      // the day marker stops the notification repeating.
      if (this.lastFired !== today) {
        this.lastFired = today
        this.settings.update({ lastBriefDate: today })
        try {
          this.onFire()
        } catch (err) {
          console.error('[brief] failed to fire the brief:', err)
        }
      }
      this.arm()
    }, delay)
  }

}
