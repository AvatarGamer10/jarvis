import { join } from 'node:path'
import { app, BrowserWindow, session, shell } from 'electron'
import { registerIpc } from './ipc'
import { createServices } from './services'

let mainWindow: BrowserWindow | null = null

/**
 * Politica de seguridad de contenido. Solo se aplica en la app empaquetada:
 * en desarrollo, Vite inyecta scripts en linea para el hot-reload y una CSP
 * estricta los bloquearia.
 *
 * El renderer no necesita conectarse a ningun sitio (todas las llamadas de red
 * salen del proceso main), asi que connect-src se queda en 'self'.
 */
function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"
        ]
      }
    })
  })
}

/**
 * Translucidez nativa de la ventana.
 *
 * Windows 11 y macOS tienen materiales de sistema distintos, y ninguno de los
 * dos se consigue solo con CSS: `backdrop-filter` difumina lo que hay dentro de
 * la app, no el escritorio de detras. Para eso hace falta pedirselo al sistema.
 *
 * Si la version del SO no lo soporta, Electron ignora la opcion y queda el
 * color de fondo solido, que tambien es una interfaz valida.
 */
function glassOptions(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'win32') {
    // El material solo se ve si el fondo es transparente del todo.
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
    title: 'JARVIS',
    ...glassOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Las tres lineas que mantienen el renderer aislado del sistema.
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })

  // Evita el parpadeo blanco: mostramos la ventana cuando ya hay algo pintado.
  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Cualquier enlace externo va al navegador del sistema, nunca a una ventana
  // de Electron (que tendria acceso al preload).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Bloquea que el renderer navegue fuera de la app.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer && url.startsWith(devServer)) return
    event.preventDefault()
    if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Una sola instancia: si se abre dos veces, la segunda enfoca la primera.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    if (app.isPackaged) applyContentSecurityPolicy()

    const services = createServices()
    registerIpc(services)
    createWindow()

    app.on('activate', () => {
      // En macOS es normal reabrir la ventana al pulsar el icono del dock.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
