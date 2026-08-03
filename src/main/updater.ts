import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'

/** Cada cuanto se vuelve a mirar si hay novedades con la app abierta. */
const INTERVALO_MS = 6 * 60 * 60 * 1000

/**
 * Las notas del parche vienen del cuerpo del release de GitHub, que puede
 * llegar como HTML o como varias entradas si se salto alguna version.
 *
 * Se limpian aqui y no en la interfaz: al renderer solo le llega texto plano,
 * asi que aunque alguien escriba HTML raro en un release, no hay nada que
 * pueda inyectarse en la pantalla.
 */
function limpiarNotas(notas: unknown): string {
  const bruto = Array.isArray(notas)
    ? notas.map((n) => (typeof n === 'string' ? n : ((n as { note?: string })?.note ?? ''))).join('\n\n')
    : typeof notas === 'string'
      ? notas
      : ''

  const texto = bruto
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

  // Un release muy largo llenaria la pantalla; para eso esta el enlace.
  return texto.length > 1200 ? `${texto.slice(0, 1200).trimEnd()}…` : texto
}

/**
 * Comprueba, descarga e instala actualizaciones desde los releases de GitHub.
 *
 * La descarga es automatica y en segundo plano; lo unico que se le pide al
 * usuario es reiniciar cuando ya esta lista. Interrumpir para preguntar
 * "¿quieres descargar?" no aporta nada: la respuesta siempre es que si.
 */
export class UpdaterService {
  private estado: UpdateState = { phase: 'idle' }
  private temporizador: NodeJS.Timeout | null = null
  private notasActuales = ''

  constructor(
    private readonly emitir: (estado: UpdateState) => void,
    /** Se llama antes de reiniciar, para que cerrar no se quede en la bandeja. */
    private readonly prepararSalida: () => void
  ) {}

  estadoActual(): UpdateState {
    return this.estado
  }

  start(): void {
    // En desarrollo no hay app-update.yml y electron-updater lanza al arrancar.
    // No es un fallo: es que no hay nada que actualizar sin empaquetar.
    if (!app.isPackaged) {
      this.cambiar({ phase: 'none', currentVersion: app.getVersion() })
      return
    }

    autoUpdater.autoDownload = true
    // Si el usuario no reinicia, la actualizacion se aplica al cerrar del todo.
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
      // Solo tiene sentido si ya sabemos que version se esta bajando.
      if (this.estado.phase !== 'downloading') return
      this.cambiar({ ...this.estado, percent: Math.round(progreso.percent) })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.cambiar({
        phase: 'ready',
        version: info.version,
        notes: limpiarNotas(info.releaseNotes) || this.notasActuales
      })
    })

    autoUpdater.on('error', (error) => {
      // Quedarse sin internet es lo normal, no una incidencia que reportar.
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

  /** Reinicia y aplica la actualizacion ya descargada. */
  instalarYReiniciar(): void {
    if (this.estado.phase !== 'ready') return
    // Sin esto, el cierre a bandeja cancelaria la salida y no se instalaria.
    this.prepararSalida()
    autoUpdater.quitAndInstall()
  }

  private cambiar(estado: UpdateState): void {
    this.estado = estado
    this.emitir(estado)
  }

  private explicar(error: Error): string {
    const mensaje = error?.message ?? String(error)

    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/i.test(mensaje)) {
      return 'Sin conexion para comprobar actualizaciones.'
    }
    if (/404/.test(mensaje)) {
      return 'No hay ninguna version publicada todavia.'
    }
    if (/403|rate limit/i.test(mensaje)) {
      return 'GitHub esta limitando las peticiones. Se reintentara mas tarde.'
    }
    return `No se pudo comprobar actualizaciones: ${mensaje}`
  }
}
