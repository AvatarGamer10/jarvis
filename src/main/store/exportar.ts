import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * Exporta e importa los datos del usuario en un solo fichero.
 *
 * Todo lo que apuntas vive en unos pocos JSON dentro de la carpeta de datos.
 * Sin una forma de sacarlos, cambiar de ordenador o recuperarse de un borrado
 * significa perderlo todo.
 *
 * Los secretos NO viajan en el fichero. Las credenciales estan cifradas con el
 * llavero del equipo y no se pueden descifrar en otro, asi que incluirlas seria
 * exportar basura ilegible; y un fichero de respaldo con la sesion de Google
 * dentro es justo lo que no conviene dejar en una carpeta compartida.
 */

/** Ficheros de datos del usuario. `credentials.bin` queda fuera a proposito. */
const FICHEROS = [
  'tasks.json',
  'examenes.json',
  'organizer-rules.json',
  'organizer-journal.json',
  'chat.json'
]

const VERSION = 1

interface Copia {
  version: number
  aplicacion: string
  exportado: string
  datos: Record<string, unknown>
}

export function exportar(destino: string): { ficheros: number } {
  const carpeta = app.getPath('userData')
  const datos: Record<string, unknown> = {}

  for (const nombre of FICHEROS) {
    const ruta = path.join(carpeta, nombre)
    if (!fs.existsSync(ruta)) continue
    try {
      datos[nombre] = JSON.parse(fs.readFileSync(ruta, 'utf8'))
    } catch (err) {
      // Un fichero corrupto no puede impedir salvar los demas.
      console.error(`[exportar] ${nombre} ilegible:`, err)
    }
  }

  const copia: Copia = {
    version: VERSION,
    aplicacion: `JARVIS ${app.getVersion()}`,
    exportado: new Date().toISOString(),
    datos
  }

  fs.writeFileSync(destino, JSON.stringify(copia, null, 2), 'utf8')
  return { ficheros: Object.keys(datos).length }
}

export function importar(origen: string): { ficheros: number } {
  const crudo = fs.readFileSync(origen, 'utf8')

  let copia: Copia
  try {
    copia = JSON.parse(crudo) as Copia
  } catch {
    throw new Error('Ese fichero no es una copia de JARVIS.')
  }

  if (typeof copia.version !== 'number' || !copia.datos) {
    throw new Error('Ese fichero no es una copia de JARVIS.')
  }
  if (copia.version > VERSION) {
    throw new Error('La copia viene de una version mas nueva de JARVIS.')
  }

  const carpeta = app.getPath('userData')
  let escritos = 0

  for (const [nombre, contenido] of Object.entries(copia.datos)) {
    // Solo se restauran ficheros conocidos: sin esta comprobacion, una copia
    // manipulada podria escribir donde quisiera dentro de la carpeta de datos.
    if (!FICHEROS.includes(nombre)) continue

    const ruta = path.join(carpeta, nombre)
    // Lo que hubiera antes se guarda al lado antes de pisarlo.
    if (fs.existsSync(ruta)) {
      fs.copyFileSync(ruta, `${ruta}.antes-de-importar`)
    }
    fs.writeFileSync(ruta, JSON.stringify(contenido, null, 2), 'utf8')
    escritos++
  }

  return { ficheros: escritos }
}

/** Nombre sugerido, con la fecha para que no se pisen entre si. */
export function nombreSugerido(): string {
  return `jarvis-copia-${new Date().toISOString().slice(0, 10)}.json`
}
