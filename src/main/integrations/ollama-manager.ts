import type { SettingsService } from '../store/settings'

/**
 * Pulling Ollama models from inside the app.
 *
 * It exists to remove the step that loses the most people: opening a terminal
 * and typing `ollama pull`. Ollama's API streams the progress, so a bar can be
 * shown rather than a wall of static text.
 */

/** Recommended models, with their real size and who each one is for. */
export const RECOMMENDED_MODELS = [
  {
    name: 'llama3.1:8b',
    label: 'Balanced',
    gigabytes: 4.7,
    description: 'The best balance for Macs with 16 GB of memory or more.',
    minimumMemoryGb: 16
  },
  {
    name: 'qwen2.5:7b',
    label: 'Strong multilingual',
    gigabytes: 4.7,
    description: 'Stronger multilingual understanding with the same memory requirement.',
    minimumMemoryGb: 16
  },
  {
    name: 'llama3.2:3b',
    label: 'Lightweight',
    gigabytes: 2,
    description: 'For 8 GB Macs. Faster and smaller, with a little less accuracy.',
    minimumMemoryGb: 8
  }
] as const

export interface OllamaPullProgress {
  model: string
  /** The phase in plain English: "Preparing", "Downloading"… */
  phase: string
  percent: number
  /** Bytes already fetched, so "1.2 of 4.7 GB" can be shown. */
  downloaded: number
  total: number
  done: boolean
  error?: string
}

interface OllamaLine {
  status?: string
  completed?: number
  total?: number
  error?: string
}

/** Turns Ollama's own status strings, which are jargon, into plain English. */
function phaseOf(status: string | undefined): string {
  if (!status) return 'Preparing'
  if (status.includes('manifest')) return 'Preparing'
  if (status.startsWith('pulling')) return 'Downloading'
  if (status.includes('verifying')) return 'Verifying'
  if (status.includes('writing') || status.includes('extracting')) return 'Installing'
  if (status === 'success') return 'Ready'
  return 'Downloading'
}

export class OllamaManager {
  private pulling: AbortController | null = null

  constructor(private readonly settings: SettingsService) {}

  private host(): string {
    return this.settings.all().ollamaHost
  }

  /** True if Ollama answers. Used to notice when it has just been installed. */
  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(new URL('/api/tags', this.host()).toString(), {
        signal: AbortSignal.timeout(2500)
      })
      return res.ok
    } catch {
      return false
    }
  }

  async models(): Promise<string[]> {
    try {
      const res = await fetch(new URL('/api/tags', this.host()).toString())
      if (!res.ok) return []
      const data = (await res.json()) as { models?: { name: string }[] }
      return (data.models ?? []).map((m) => m.name)
    } catch {
      return []
    }
  }

  cancelPull(): void {
    this.pulling?.abort()
    this.pulling = null
  }

  /**
   * Pulls a model, reporting progress.
   *
   * Ollama answers with one JSON line per event rather than a single JSON
   * document, so the stream is read and split on newlines. A chunk can cut a
   * line in half, which is why the remainder is kept for the next round.
   */
  async pullModel(
    model: string,
    onProgress: (progress: OllamaPullProgress) => void
  ): Promise<void> {
    this.cancelPull()
    this.pulling = new AbortController()

    const emit = (partial: Partial<OllamaPullProgress>): void =>
      onProgress({
        model,
        phase: 'Preparing',
        percent: 0,
        downloaded: 0,
        total: 0,
        done: false,
        ...partial
      })

    let res: Response
    try {
      res = await fetch(new URL('/api/pull', this.host()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: true }),
        signal: this.pulling.signal
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      emit({ done: true, error: 'Cannot reach Ollama. Check that it is running.' })
      return
    }

    if (!res.ok || !res.body) {
      emit({
        done: true,
        error:
          res.status === 404
            ? `Ollama does not recognise the model “${model}”.`
            : `Ollama returned an error (${res.status}).`
      })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let remainder = ''

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        remainder += decoder.decode(value, { stream: true })
        const lines = remainder.split('\n')
        // The last one may be cut in half: it is kept for the next round.
        remainder = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue

          let event: OllamaLine
          try {
            event = JSON.parse(line) as OllamaLine
          } catch {
            continue
          }

          if (event.error) {
            emit({ done: true, error: event.error })
            return
          }

          const total = event.total ?? 0
          const completed = event.completed ?? 0
          emit({
            phase: phaseOf(event.status),
            percent: total > 0 ? Math.round((completed / total) * 100) : 0,
            downloaded: completed,
            total
          })

          if (event.status === 'success') {
            // Left selected: whoever just downloaded it wants to use it.
            this.settings.update({ ollamaModel: model })
            emit({ phase: 'Ready', percent: 100, done: true })
            return
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      emit({ done: true, error: (err as Error).message })
    } finally {
      this.pulling = null
    }
  }
}
