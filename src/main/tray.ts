import { app, Menu, Tray, type BrowserWindow } from 'electron'
import { createTrayIcon } from './tray-icon'

interface TrayActions {
  showWindow: () => void
  showBrief: () => void
  toggleHud: () => void
  quit: () => void
}

/**
 * The menu bar icon.
 *
 * Not decoration: the morning brief can only fire if the process is still
 * alive at the time it is due. The tray is what makes closing the window stop
 * short of killing the app, and at the same time what makes it obvious it is
 * still there.
 */
export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('Vilo')

  const menu = Menu.buildFromTemplate([
    { label: 'Open Vilo', click: actions.showWindow },
    { label: 'Floating orb   Ctrl+Alt+J', click: actions.toggleHud },
    { label: "Today's brief", click: actions.showBrief },
    { type: 'separator' },
    { label: 'Quit Vilo', click: actions.quit }
  ])

  tray.setContextMenu(menu)
  // Windows expects a single click to open; macOS expects it to drop the menu
  // down, which is what setContextMenu already does.
  if (process.platform === 'win32') tray.on('click', actions.showWindow)

  return tray
}

/** Tells "close the window" apart from "actually quit". */
export const exitState = { quitting: false }

export function closeToTray(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (exitState.quitting) return
    // Closing hides rather than kills, so the brief stays scheduled.
    event.preventDefault()
    window.hide()
    if (process.platform === 'darwin') app.dock?.hide()
  })
}
