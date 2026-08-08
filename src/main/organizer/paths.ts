import fs from 'node:fs'
import path from 'node:path'

/**
 * Path guards. This file is the only reason the organiser cannot do damage, so
 * it is worth reading carefully before
 * tocarlo.
 */

export class PathNotAllowedError extends Error {
  constructor(target: string) {
    super(`"${target}" is outside the authorised folders.`)
    this.name = 'PathNotAllowedError'
  }
}

/**
 * Resolves a path to its canonical form, following symbolic links.
 *
 * Without `realpathSync`, a link inside an authorised folder pointing at
 * C:\Windows would pass the check — the path "looks" as if it is inside.
 * If the file does not exist yet — the destination of a move — the parent
 * directory is resolved instead, which does.
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

/** True if `target` is inside `root`, or is `root` itself. */
export function isInside(root: string, target: string): boolean {
  const from = canonical(root)
  const to = canonical(target)

  const relative = path.relative(from, to)
  // Tres condiciones: no sale hacia arriba, no salta a otra unidad (en Windows
  // path.relative returns an absolute path when the disk changes), and is not
  // the same place under another name.
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** Throws if the path falls outside every authorised folder. */
export function assertAllowed(roots: string[], target: string): void {
  if (roots.length === 0) {
    throw new PathNotAllowedError(target)
  }
  if (!roots.some((root) => isInside(root, target))) {
    throw new PathNotAllowedError(target)
  }
}

/**
 * If a file of that name already exists at the destination, finds a free
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
    // A seatbelt: if something goes wrong, better to fail than to spin forever.
    if (counter > 999) throw new Error(`Too many files already named "${filename}".`)
  }
  return candidate
}
