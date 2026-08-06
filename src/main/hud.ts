import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import type { SettingsService } from './store/settings'

/** Tamano del boton recogido y del panel cuando muestra una respuesta. */
export const HUD_RECOGIDO = { width: 86, height: 86 }
export const HUD_ABIERTO = { width: 340, height: 260 }

/**
 * Ventana flotante siempre encima.
 *
 * Existe para el caso de estar en el navegador —mirando Classroom, por
 * ejemplo— y querer apuntar algo sin cambiar de ventana. Por eso es un boton y
 * no un panel: si ocupara sitio de verdad, acabaria estorbando y cerrandose.
 *
 * Solo crece mientras tiene algo que ensenar, y vuelve a encogerse despues.
 */
export class Hud {
  private ventana: BrowserWindow | null = null
  /** Donde estaba el boton antes de crecer, para devolverlo ahi al encoger. */
  private anclaRecogido: { x: number; y: number } | null = null

  constructor(private readonly settings: SettingsService) {}

  visible(): boolean {
    return this.ventana !== null && !this.ventana.isDestroyed()
  }

  alternar(): void {
    if (this.visible()) this.cerrar()
    else this.abrir()
  }

  abrir(): void {
    if (this.visible()) {
      this.ventana?.focus()
      return
    }

    const { x, y } = this.posicionInicial()

    this.ventana = new BrowserWindow({
      ...HUD_RECOGIDO,
      x,
      y,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      // Fuera de la barra de tareas y del alt-tab: es un accesorio, no una app.
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // "floating" lo mantiene sobre ventanas normales sin taparlo todo, que es
    // lo que pasa con niveles mas altos como screen-saver.
    this.ventana.setAlwaysOnTop(true, 'floating')
    // Que siga visible al cambiar de escritorio virtual.
    this.ventana.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const parametro = 'vista=hud'
    if (process.env.ELECTRON_RENDERER_URL) {
      void this.ventana.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${parametro}`)
    } else {
      void this.ventana.loadFile(join(__dirname, '../renderer/index.html'), {
        search: parametro
      })
    }

    this.ventana.on('closed', () => {
      this.ventana = null
    })

    this.settings.update({ hudVisible: true })
  }

  cerrar(): void {
    this.ventana?.close()
    this.ventana = null
    this.settings.update({ hudVisible: false })
  }

  /** Mueve la ventana en incrementos, que es como llega el arrastre. */
  mover(dx: number, dy: number): void {
    if (!this.visible() || !this.ventana) return

    const [x, y] = this.ventana.getPosition()
    const destino = this.dentroDePantalla(Math.round(x + dx), Math.round(y + dy))
    this.ventana.setPosition(destino.x, destino.y)
    this.settings.update({ hudX: destino.x, hudY: destino.y })
  }

  /**
   * Crece o encoge segun necesite ensenar algo.
   *
   * Al crecer se ancla por el lado contrario si no cabe: un HUD pegado al
   * borde derecho se saldria de la pantalla si creciera siempre hacia la
   * derecha.
   *
   * Al encoger vuelve exactamente a donde estaba el boton, no a la esquina del
   * panel. Sin recordar ese punto, cada ciclo de abrir y cerrar cerca del
   * borde derecho desplazaba el boton un poco mas a la izquierda, y acababa
   * migrando solo por la pantalla.
   */
  ajustar(abierto: boolean): void {
    if (!this.visible() || !this.ventana) return

    const tamano = abierto ? HUD_ABIERTO : HUD_RECOGIDO
    const [x, y] = this.ventana.getPosition()

    if (!abierto) {
      const vuelta = this.anclaRecogido ?? { x, y }
      this.anclaRecogido = null
      const destino = this.dentroDePantalla(vuelta.x, vuelta.y, tamano)
      this.ventana.setBounds({ ...tamano, x: destino.x, y: destino.y })
      return
    }

    // Se guarda de donde salio para poder volver ahi al encogerse.
    this.anclaRecogido = { x, y }

    const pantalla = screen.getDisplayNearestPoint({ x, y }).workArea
    const noCabeALaDerecha = x + tamano.width > pantalla.x + pantalla.width
    const nuevoX = noCabeALaDerecha
      ? x - (tamano.width - this.ventana.getBounds().width)
      : x

    const destino = this.dentroDePantalla(nuevoX, y, tamano)
    this.ventana.setBounds({ ...tamano, x: destino.x, y: destino.y })
  }

  private posicionInicial(): { x: number; y: number } {
    const { hudX, hudY } = this.settings.all()
    if (hudX !== null && hudY !== null) {
      return this.dentroDePantalla(hudX, hudY)
    }

    // Por defecto, abajo a la derecha pero sin pegarse al borde.
    const area = screen.getPrimaryDisplay().workArea
    return {
      x: area.x + area.width - HUD_RECOGIDO.width - 28,
      y: area.y + area.height - HUD_RECOGIDO.height - 28
    }
  }

  /**
   * Evita que quede fuera de la pantalla. Pasa mas de lo que parece: al
   * desconectar un monitor, la posicion guardada apunta a un sitio que ya no
   * existe y la ventana se vuelve inalcanzable.
   */
  private dentroDePantalla(
    x: number,
    y: number,
    tamano = HUD_RECOGIDO
  ): { x: number; y: number } {
    const area = screen.getDisplayNearestPoint({ x, y }).workArea
    return {
      x: Math.min(Math.max(x, area.x), area.x + area.width - tamano.width),
      y: Math.min(Math.max(y, area.y), area.y + area.height - tamano.height)
    }
  }
}
