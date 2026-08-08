import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'

/** How often to look for an update while the app is open. */
const INTERVALO_MS = 6 * 60 * 60 * 1000

/**
 * The release notes come from the body of the GitHub release, which can
 * arrive as HTML, or as several entries if a version was skipped.
 *
 * Cleaned here and not in the interface: the renderer only ever receives plain
 * text, so even if somebody writes odd HTML in a release there is nothing to
 * could be injected into the screen.
 */
function limpiarNotas(notas: unknown): string {
  const bruto = Array.isArray(notas)
    ? notas.map((n) => (typeof n === 'string' ? n : ((n as { note?: string })?.note ?? ''))).join('\n\n')
    : typeof notas === 'string'
      ? notas
      : ''

  const text = bruto
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // A very long release would fill the screen; that is what the link is for.
  return text.length > 1200 ? `${text.slice(0, 1200).trimEnd()}…` : text
}

/**
 * Checks, downloads and installs updates from GitHub releases.
 *
 * The download is automatic and in the background; the only thing asked of the
 * user is to restart once it is ready. Interrupting to ask "do you want to
 * download this?" adds nothing: the answer is always yes.
 */
export class UpdaterService {
  private state: UpdateState = { phase: 'idle' }
  private temporizador: NodeJS.Timeout | null = null
  private notasActuales = ''

  constructor(
    private readonly emitir: (state: UpdateState) => void,
    /** Called before restarting, so closing does not stop at the tray. */
    private readonly prepararSalida: () => void
  ) {}

  estadoActual(): UpdateState {
    return this.state
  }

  start(): void {
    // En desarrollo no hay app-update.yml y electron-updater lanza al arrancar.
    // Not a failure: there is simply nothing to update when unpackaged.
    if (!app.isPackaged) {
      this.cambiar({ phase: 'none', currentVersion: app.getVersion() })
      return
    }

    autoUpdater.autoDownload = true
    // If the user does not restart, the update is applied on a full quit.
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.cambiar({ phase: 'checking' }))

    autoUpdater.on('update-not-available', () =>
      this.cambiar({ phase: 'none', currentVersion: app.getVersion() })
    )

    autoUpdater.on('update-available', (info) => {
      this.notasActuales = limpiarNotas(info.releaseNotes)
      this.cambiar({
        phase: 'downloading',
        version: info.version,
        percent: 0,
        notes: this.notasActuales
      })
    })

    autoUpdater.on('download-progress', (progreso) => {
      // Only meaningful once we know which version is coming down.
      if (this.state.phase !== 'downloading') return
      this.cambiar({ ...this.state, percent: Math.round(progreso.percent) })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.cambiar({
        phase: 'ready',
        version: info.version,
        notes: limpiarNotas(info.releaseNotes) || this.notasActuales
      })
    })

    autoUpdater.on('error', (error) => {
      // Losing the connection is ordinary, not an incident worth reporting.
      console.error('[updater]', error)
      this.cambiar({ phase: 'error', message: this.explicar(error) })
    })

    void this.check()
    this.temporizador = setInterval(() => void this.check(), INTERVALO_MS)
  }

  stop(): void {
    if (this.temporizador) clearInterval(this.temporizador)
    this.temporizador = null
  }

  async check(): Promise<void> {
    if (!app.isPackaged) return
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      this.cambiar({ phase: 'error', message: this.explicar(error as Error) })
    }
  }

  /** Restarts and applies the update that has already been downloaded. */
  instalarYReiniciar(): void {
    if (this.state.phase !== 'ready') return
    // Without this, close-to-tray would cancel the quit and nothing would install.
    this.prepararSalida()
    autoUpdater.quitAndInstall()
  }

  private cambiar(state: UpdateState): void {
    this.state = state
    this.emitir(state)
  }

  private explicar(error: Error): string {
    const message = error?.message ?? String(error)

    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/i.test(message)) {
      return 'No connection, so updates could not be checked.'
    }
    if (/404/.test(message)) {
      return 'No version has been published yet.'
    }
    if (/403|rate limit/i.test(message)) {
      return 'GitHub is rate limiting us. It will try again later.'
    }
    return `Could not check for updates: ${message}`
  }
}
