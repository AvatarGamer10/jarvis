import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  globalShortcut,
  Notification,
  session,
  shell,
  type Tray
} from 'electron'
import { Channels } from '@shared/ipc'
import { Hud } from './hud'
import { registerIpc } from './ipc'
import { createServices } from './services'
import { registerScheme, registerProtocol } from './model-proxy'
import { closeToTray, createTray, exitState } from './tray'
import { UpdaterService } from './updater'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let updater: UpdaterService | null = null
let hud: Hud | null = null

// Electron otherwise exposes its host name in development (and, depending on
// how the app was launched, in the macOS menu). Set the product identity before
// the ready event so every native surface agrees with the packaged bundle.
app.setName('Vilo')

// Must be declared before the app is ready. This is what makes vilo:// a real
// origin, with a Cache API and storage of its own — see the long note in
// model-proxy.ts about why file:// will not do.
registerScheme()

/**
 * Content security policy. Only applied in the packaged app: in development
 * Vite injects inline scripts for hot reloading and a strict policy would
 * block them.
 *
 * One permission exists solely for speech recognition, and it is worth knowing
 * why before touching it. `wasm-unsafe-eval` is what lets Whisper compile its
 * WebAssembly module; it is far narrower than 'unsafe-eval', allowing WASM and
 * not JavaScript eval().
 *
 * Models are NOT downloaded from the renderer: the main process fetches them
 * and they arrive over the vilo:// scheme, which is all connect-src has to
 * allow. See model-proxy.ts.
 */
function applyContentSecurityPolicy(): void {
  /*
   * Models no longer leave the renderer.
   *
   * This used to be a list of Hugging Face domains, and keeping it current was
   * a race nobody wins: the hub redirects to a different CDN every season
   * (cdn-lfs, then cdn-lfs-us-1.hf.co, now the Xet bridge), and the moment one
   * fell off the list Chromium cut the request and all the user saw was a
   * generic network error.
   *
   * Downloads are the main process's job now and arrive over vilo://hf, which
   * goes through neither CORS nor this policy. All that is needed here is the
   * scheme itself.
   */
  const modelHost = 'vilo:'

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            "script-src 'self' 'wasm-unsafe-eval'; " +
            "worker-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; " +
            `connect-src 'self' ${modelHost}; ` +
            "media-src 'self' blob:; " +
            "object-src 'none'; base-uri 'none'"
        ]
      }
    })
  })
}

/**
 * Which system permissions the renderer is allowed to ask for.
 *
 * Electron grants them all without asking by default. Only the microphone is
 * admitted here, because it is the only one the app needs; everything else is
 * refused.
 */
function restrictPermissions(): void {
  const allowedOrigin = (url: string | undefined): boolean => {
    if (!url) return false

    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer && url.startsWith(devServer)) return true

    try {
      const parsed = new URL(url)
      return parsed.protocol === 'vilo:' && parsed.hostname === 'app'
    } catch {
      return false
    }
  }

  /*
   * Chromium checks a permission before it requests it. Electron requires both
   * handlers to agree; with only the request handler, every getUserMedia call
   * looked unapproved and macOS asked again even after the user chose Allow.
   */
  session.defaultSession.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin, details) =>
      permission === 'media' &&
      details.isMainFrame &&
      // Electron may report `unknown` during Chromium's initial permission
      // check and only identify `audio` in the request that follows. Rejecting
      // that preliminary check makes getUserMedia ask macOS again forever.
      details.mediaType !== 'video' &&
      allowedOrigin(details.securityOrigin ?? details.requestingUrl ?? requestingOrigin)
  )

  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const media = details as Electron.MediaAccessPermissionRequest
    // `mediaTypes` is optional in Electron. The origin and main-frame checks
    // still make an omitted list safe, while an explicit camera request stays
    // denied.
    const audioOnly =
      !media.mediaTypes ||
      (media.mediaTypes.includes('audio') && !media.mediaTypes.includes('video'))
    callback(
      permission === 'media' &&
        media.isMainFrame &&
        audioOnly &&
        allowedOrigin(media.securityOrigin ?? media.requestingUrl)
    )
  })
}

/**
 * Native window translucency.
 *
 * Windows 11 and macOS have different system materials, and neither can be had
 * from CSS alone: `backdrop-filter` blurs what is inside the app, not the
 * desktop behind it. That has to be asked of the operating system.
 *
 * If the OS version does not support it, Electron ignores the option and the
 * solid background colour remains, which is also a perfectly good interface.
 */
function glassOptions(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'win32') {
    // The material is only visible if the background is fully transparent.
    return { backgroundColor: '#00000000', backgroundMaterial: 'acrylic' }
  }
  if (process.platform === 'darwin') {
    return {
      backgroundColor: '#00000000',
      vibrancy: 'under-window',
      visualEffectState: 'active',
      titleBarStyle: 'hiddenInset'
    }
  }
  return { backgroundColor: '#080A0F' }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Vilo',
    ...glassOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The three lines that keep the renderer isolated from the system.
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })

  // Avoids the white flash: the window is shown once something is painted.
  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Any external link goes to the system browser, never to an Electron window
  // (which would have access to the preload).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Stops the renderer navigating away from the app.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer && url.startsWith(devServer)) return
    if (url.startsWith('vilo://app')) return
    event.preventDefault()
    if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadURL('vilo://app/index.html')
  }

  // In development, what happens in the interface shows up in the terminal.
  // Without this a renderer error sits in DevTools nobody is looking at.
  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, source) => {
      const label = ['LOG', 'WARN', 'ERROR', 'DEBUG'][level] ?? 'LOG'
      const where = source ? ` (${source.split('/').pop()}:${line})` : ''
      console.log(`[render:${label}]${where} ${message}`)
    })
  }

  closeToTray(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** Brings the window to the front, creating it if the user had closed it. */
function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  if (process.platform === 'darwin') void app.dock?.show()
  mainWindow.focus()
}

/**
 * In development, data goes to a separate folder.
 *
 * Without this the development build and the installed one share settings, the
 * Google session and your tasks, because on Windows "vilo" and "Vilo" are the
 * same folder. That causes two problems: trying things out corrupts real data,
 * and the single-instance lock — which is derived from this path — stops both
 * being open at once.
 *
 * Has to run before the app is ready.
 */
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

// One instance only: opening it twice focuses the first.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.vilo.app')

    // A development build still runs inside Electron.app, so macOS will use
    // Electron's dock icon unless we explicitly supply Vilo's real artwork.
    if (process.platform === 'darwin' && !app.isPackaged) {
      app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
    }

    registerProtocol()
    if (app.isPackaged) applyContentSecurityPolicy()
    restrictPermissions()

    const services = createServices()

    // Fresh install: the current version counts as already seen. The welcome
    // screen covers what is here, and it means the first update they do get
    // can show exactly what changed since this one.
    const initialSettings = services.settings.all()
    if (!initialSettings.lastSeenVersion && !initialSettings.onboardingDone) {
      services.settings.update({ lastSeenVersion: app.getVersion() })
    }

    /**
     * Fires the morning brief as a system notification.
     *
     * Asked for without model-written prose: the notification only shows the
     * headline, and waiting for a local model to write two sentences would
     * delay it by several seconds for something nobody would see.
     */
    const notifyBrief = async (): Promise<void> => {
      try {
        const brief = await services.brief.build(false)
        if (!Notification.isSupported()) return

        const notification = new Notification({
          title: 'Your day',
          body: brief.headline
        })
        notification.on('click', showWindow)
        notification.show()
      } catch (err) {
        console.error('[brief] could not build the brief:', err)
      }
    }

    const scheduler = services.scheduler(() => void notifyBrief())

    updater = new UpdaterService(
      (state) => mainWindow?.webContents.send(Channels.updaterState, state),
      () => {
        exitState.quitting = true
      }
    )

    hud = new Hud(services.settings)
    if (services.settings.all().hudVisible) hud.open()

    // Global shortcut for the floating orb, so it does not require finding the
    // window first. If another app already holds it, register returns false and
    // we do not fight over it.
    if (!globalShortcut.register('Control+Alt+J', () => hud?.toggle())) {
      console.warn('[hud] Ctrl+Alt+J is already taken by another application')
    }

    registerIpc(services, {
      onOpenApp: showWindow,
      onSettingsChanged: () => {
        scheduler.reschedule()
        // Starting at login is the operating system's job, not a file of ours.
        app.setLoginItemSettings({
          openAtLogin: services.settings.all().startAtLogin,
          // If it starts on its own, it should be discreet: to the tray,
          // without stealing focus.
          args: ['--hidden']
        })
      }
    }, updater, hud)

    createWindow()
    tray = createTray({
      showWindow,
      showBrief: () => void notifyBrief(),
      toggleHud: () => hud?.toggle(),
      quit: () => {
        exitState.quitting = true
        app.quit()
      }
    })
    scheduler.start()
    // Started after the window exists: otherwise the first events would be
    // emitted with nobody listening and the interface would open blank.
    updater.start()

    // Started by the system at login: the window stays hidden.
    if (process.argv.includes('--hidden')) mainWindow?.hide()

    app.on('activate', showWindow)
  })

  // The app stays alive with no windows: the tray keeps it there, and without
  // that the morning brief could never fire. Quitting is done from the tray.
  app.on('window-all-closed', () => {})

  app.on('before-quit', () => {
    exitState.quitting = true
    updater?.stop()
    globalShortcut.unregisterAll()
    tray?.destroy()
  })
}
