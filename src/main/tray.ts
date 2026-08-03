import { app, Menu, Tray, type BrowserWindow } from 'electron'
import { crearIconoBandeja } from './tray-icon'

interface Opciones {
  mostrarVentana: () => void
  mostrarResumen: () => void
  alternarHud: () => void
  salir: () => void
}

/**
 * Icono de bandeja.
 *
 * No es decoracion: el resumen diario solo puede dispararse si el proceso sigue
 * vivo a la hora fijada. La bandeja es lo que hace que cerrar la ventana no
 * mate la app, y a la vez lo que deja claro que sigue ahi.
 */
export function crearBandeja(opciones: Opciones): Tray {
  const tray = new Tray(crearIconoBandeja())
  tray.setToolTip('JARVIS')

  const menu = Menu.buildFromTemplate([
    { label: 'Abrir JARVIS', click: opciones.mostrarVentana },
    { label: 'Boton flotante   Ctrl+Alt+J', click: opciones.alternarHud },
    { label: 'Resumen de hoy', click: opciones.mostrarResumen },
    { type: 'separator' },
    { label: 'Salir', click: opciones.salir }
  ])

  tray.setContextMenu(menu)
  // En Windows se espera que el clic simple abra; en macOS, que despliegue el
  // menu (que es lo que hace por defecto con setContextMenu).
  if (process.platform === 'win32') tray.on('click', opciones.mostrarVentana)

  return tray
}

/** Marca para distinguir "cerrar la ventana" de "salir de verdad". */
export const estadoSalida = { saliendo: false }

export function prepararCierreABandeja(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (estadoSalida.saliendo) return
    // Cerrar esconde en vez de matar, para que el resumen siga programado.
    event.preventDefault()
    window.hide()
    if (process.platform === 'darwin') app.dock?.hide()
  })
}
