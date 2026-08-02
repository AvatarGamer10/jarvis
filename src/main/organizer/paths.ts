import fs from 'node:fs'
import path from 'node:path'

/**
 * Guardas de rutas. Este fichero es la unica razon por la que el organizador
 * no puede hacer estropicios, asi que conviene leerlo con calma antes de
 * tocarlo.
 */

export class PathNotAllowedError extends Error {
  constructor(target: string) {
    super(`La ruta "${target}" esta fuera de las carpetas autorizadas.`)
    this.name = 'PathNotAllowedError'
  }
}

/**
 * Resuelve una ruta a su forma canonica siguiendo enlaces simbolicos.
 *
 * Sin `realpathSync`, un enlace dentro de una carpeta autorizada que apunte a
 * C:\Windows pasaria la comprobacion: la ruta "parece" estar dentro.
 * Si el fichero aun no existe (el destino de un movimiento), resolvemos el
 * directorio padre, que si existe.
 */
function canonical(target: string): string {
  const absolute = path.resolve(target)
  try {
    return fs.realpathSync.native(absolute)
  } catch {
    const parent = path.dirname(absolute)
    try {
      return path.join(fs.realpathSync.native(parent), path.basename(absolute))
    } catch {
      return absolute
    }
  }
}

/** True si `target` esta dentro de `root` (o es el propio root). */
export function isInside(root: string, target: string): boolean {
  const from = canonical(root)
  const to = canonical(target)

  const relative = path.relative(from, to)
  // Tres condiciones: no sale hacia arriba, no salta a otra unidad (en Windows
  // path.relative devuelve una ruta absoluta si cambian de disco), y no es el
  // mismo sitio con otro nombre.
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** Lanza si la ruta no cae dentro de ninguna de las carpetas autorizadas. */
export function assertAllowed(roots: string[], target: string): void {
  if (roots.length === 0) {
    throw new PathNotAllowedError(target)
  }
  if (!roots.some((root) => isInside(root, target))) {
    throw new PathNotAllowedError(target)
  }
}

/**
 * Si en el destino ya hay un archivo con ese nombre, busca uno libre
 * anadiendo " (2)", " (3)"... Nunca sobrescribe.
 */
export function availableName(destinationDir: string, filename: string): string {
  const extension = path.extname(filename)
  const base = path.basename(filename, extension)

  let candidate = filename
  let counter = 2
  while (fs.existsSync(path.join(destinationDir, candidate))) {
    candidate = `${base} (${counter})${extension}`
    counter++
    // Cinturon de seguridad: si algo va mal, mejor fallar que girar para siempre.
    if (counter > 999) throw new Error(`Demasiados archivos con el nombre "${filename}".`)
  }
  return candidate
}
