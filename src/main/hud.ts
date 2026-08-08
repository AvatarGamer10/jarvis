import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import type { SettingsService } from './store/settings'

/** Size of the collapsed button, and of the panel when it has an answer. */
export const HUD_COLLAPSED = { width: 86, height: 86 }
export const HUD_OPEN = { width: 340, height: 260 }

/**
 * The always-on-top floating window.
 *
 * It exists for the case of being in the browser — looking at Classroom, say —
 * and wanting to note something down without changing window. That is why it
 * is a button and not a panel: if it took up real space it would end up in the
 * way, and then closed.
 *
 * It only grows while it has something to show, and shrinks again afterwards.
 */
export class Hud {
  private window: BrowserWindow | null = null
  /** Where the button was before it grew, so it can go back there. */
  private collapsedAnchor: { x: number; y: number } | null = null

  constructor(private readonly settings: SettingsService) {}

  visible(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }

  toggle(): void {
    if (this.visible()) this.close()
    else this.open()
  }

  open(): void {
    if (this.visible()) {
      this.window?.focus()
      return
    }

    const { x, y } = this.startingPosition()

    this.window = new BrowserWindow({
      ...HUD_COLLAPSED,
      x,
      y,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      // Out of the taskbar and out of alt-tab: it is an accessory, not an app.
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // "floating" keeps it above ordinary windows without covering everything,
    // which is what higher levels like screen-saver do.
    this.window.setAlwaysOnTop(true, 'floating')
    // Stays visible when switching virtual desktops.
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const query = 'view=hud'
    if (process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${query}`)
    } else {
      // Same origin as the main window, so it shares its cache and storage.
      // See model-proxy.ts.
      void this.window.loadURL(`vilo://app/index.html?${query}`)
    }

    this.window.on('closed', () => {
      this.window = null
    })

    this.settings.update({ hudVisible: true })
  }

  close(): void {
    this.window?.close()
    this.window = null
    this.settings.update({ hudVisible: false })
  }

  /** Moves the window in increments, which is how a drag arrives. */
  move(dx: number, dy: number): void {
    if (!this.visible() || !this.window) return

    const [x, y] = this.window.getPosition()
    const target = this.ontoScreen(Math.round(x + dx), Math.round(y + dy))
    this.window.setPosition(target.x, target.y)
    this.settings.update({ hudX: target.x, hudY: target.y })
  }

  /**
   * Grows or shrinks depending on whether it has something to show.
   *
   * When growing it anchors to the opposite side if it does not fit: a HUD
   * pinned to the right edge would run off the screen if it always grew to the
   * right.
   *
   * When shrinking it returns exactly to where the button was, not to the
   * corner of the panel. Without remembering that point, every open-and-close
   * cycle near the right edge nudged the button a little further left, and it
   * would slowly migrate across the screen on its own.
   */
  resize(open: boolean): void {
    if (!this.visible() || !this.window) return

    const size = open ? HUD_OPEN : HUD_COLLAPSED
    const [x, y] = this.window.getPosition()

    if (!open) {
      const back = this.collapsedAnchor ?? { x, y }
      this.collapsedAnchor = null
      const target = this.ontoScreen(back.x, back.y, size)
      this.window.setBounds({ ...size, x: target.x, y: target.y })
      return
    }

    // Remember where it came from, so it can return there when it shrinks.
    this.collapsedAnchor = { x, y }

    const display = screen.getDisplayNearestPoint({ x, y }).workArea
    const overflowsRight = x + size.width > display.x + display.width
    const nextX = overflowsRight ? x - (size.width - this.window.getBounds().width) : x

    const target = this.ontoScreen(nextX, y, size)
    this.window.setBounds({ ...size, x: target.x, y: target.y })
  }

  private startingPosition(): { x: number; y: number } {
    const { hudX, hudY } = this.settings.all()
    if (hudX !== null && hudY !== null) {
      return this.ontoScreen(hudX, hudY)
    }

    // By default, bottom right but not jammed against the edge.
    const area = screen.getPrimaryDisplay().workArea
    return {
      x: area.x + area.width - HUD_COLLAPSED.width - 28,
      y: area.y + area.height - HUD_COLLAPSED.height - 28
    }
  }

  /**
   * Keeps it from ending up off-screen. This happens more than it sounds: on
   * unplugging a monitor the saved position points somewhere that no longer
   * exists, and the window becomes unreachable.
   */
  private ontoScreen(x: number, y: number, size = HUD_COLLAPSED): { x: number; y: number } {
    const area = screen.getDisplayNearestPoint({ x, y }).workArea
    return {
      x: Math.min(Math.max(x, area.x), area.x + area.width - size.width),
      y: Math.min(Math.max(y, area.y), area.y + area.height - size.height)
    }
  }
}
