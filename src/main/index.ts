import { join } from 'node:path'
import { app, BrowserWindow, Notification, session, shell, type Tray } from 'electron'
import { Channels } from '@shared/ipc'
import { registerIpc } from './ipc'
import { createServices } from './services'
import { crearBandeja, estadoSalida, prepararCierreABandeja } from './tray'
import { UpdaterService } from './updater'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let updater: UpdaterService | null = null

/**
 * Politica de seguridad de contenido. Solo se aplica en la app empaquetada:
 * en desarrollo, Vite inyecta scripts en linea para el hot-reload y una CSP
 * estricta los bloquearia.
 *
 * Dos permisos existen solo por el reconocimiento de voz, y conviene saber por
 * que estan antes de tocarlos:
 *
 * - `wasm-unsafe-eval`: Whisper corre en WebAssembly. Sin esto no se puede
 *   compilar el modulo. Es mucho mas acotado que 'unsafe-eval': permite WASM,
 *   no permite eval() de JavaScript.
 * - Los dominios de Hugging Face: de ahi se descarga el modelo de voz, una
 *   sola vez. Despues queda en cache y funciona sin conexion.
 *
 * El resto de llamadas de red siguen saliendo del proceso main, no de aqui.
 */
function applyContentSecurityPolicy(): void {
  const modeloVoz = 'https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.hf.co'

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            "script-src 'self' 'wasm-unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; " +
            `connect-src 'self' ${modeloVoz}; ` +
            "media-src 'self' blob:; " +
            "object-src 'none'; base-uri 'none'"
        ]
      }
    })
  })
}

/**
 * Permisos del sistema que el renderer puede pedir.
 *
 * Por defecto Electron los concede todos sin preguntar. Aqui solo se admite el
 * microfono, que es el unico que la app necesita; cualquier otro se deniega.
 */
function restringirPermisos(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'media')
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

  prepararCierreABandeja(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** Trae la ventana al frente, creandola si el usuario la habia cerrado. */
function mostrarVentana(): void {
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
 * En desarrollo, los datos van a una carpeta aparte.
 *
 * Sin esto, la version de desarrollo y la instalada comparten ajustes, sesion
 * de Google y tareas, porque en Windows "jarvis" y "JARVIS" son la misma
 * carpeta. Eso trae dos problemas: probar cosas corrompe los datos reales, y
 * el bloqueo de instancia unica (que se calcula sobre esta ruta) impide tener
 * las dos abiertas a la vez.
 *
 * Tiene que ejecutarse antes de que la app este lista.
 */
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

// Una sola instancia: si se abre dos veces, la segunda enfoca la primera.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', mostrarVentana)

  void app.whenReady().then(() => {
    if (app.isPackaged) applyContentSecurityPolicy()
    restringirPermisos()

    const services = createServices()

    /**
     * Lanza el resumen del dia como notificacion del sistema.
     *
     * Se pide sin redaccion del modelo: la notificacion solo muestra el
     * titular, y esperar a que un modelo local escriba dos frases retrasaria
     * el aviso varios segundos sin que se vea el resultado.
     */
    const notificarResumen = async (): Promise<void> => {
      try {
        const brief = await services.brief.build(false)
        if (!Notification.isSupported()) return

        const notificacion = new Notification({
          title: 'Tu dia en JARVIS',
          body: brief.headline
        })
        notificacion.on('click', mostrarVentana)
        notificacion.show()
      } catch (err) {
        console.error('[brief] no se pudo generar el resumen:', err)
      }
    }

    const scheduler = services.scheduler(() => void notificarResumen())

    updater = new UpdaterService(
      (estado) => mainWindow?.webContents.send(Channels.updaterState, estado),
      () => {
        estadoSalida.saliendo = true
      }
    )

    registerIpc(services, {
      onSettingsChanged: () => {
        scheduler.reschedule()
        // El arranque automatico lo gestiona el sistema, no un fichero nuestro.
        app.setLoginItemSettings({
          openAtLogin: services.settings.all().startAtLogin,
          // Si arranca solo, que lo haga discreto: a la bandeja, sin robar foco.
          args: ['--oculto']
        })
      }
    }, updater)

    createWindow()
    tray = crearBandeja({
      mostrarVentana,
      mostrarResumen: () => void notificarResumen(),
      salir: () => {
        estadoSalida.saliendo = true
        app.quit()
      }
    })
    scheduler.start()
    // Se arranca despues de crear la ventana: si no, los primeros eventos se
    // emitirian sin nadie escuchando y la interfaz abriria en blanco.
    updater.start()

    // Arrancado por el sistema al iniciar sesion: no se muestra la ventana.
    if (process.argv.includes('--oculto')) mainWindow?.hide()

    app.on('activate', mostrarVentana)
  })

  // La app sigue viva sin ventanas: la bandeja la mantiene, y sin eso el
  // resumen diario no podria dispararse. Se sale desde el menu de la bandeja.
  app.on('window-all-closed', () => {})

  app.on('before-quit', () => {
    estadoSalida.saliendo = true
    updater?.stop()
    tray?.destroy()
  })
}
