import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FileRule, MovePlan, PlannedMove } from '@shared/types'
import { assertAllowed, availableName } from './paths'

/** Tope de archivos que se examinan de una vez, para no bloquear la app. */
const MAX_FILES = 2000

function matches(rule: FileRule, filename: string): boolean {
  if (rule.extensions.length > 0) {
    const extension = path.extname(filename).slice(1).toLowerCase()
    if (!rule.extensions.map((e) => e.toLowerCase().replace(/^\./, '')).includes(extension)) {
      return false
    }
  }
  if (rule.nameContains.trim()) {
    if (!filename.toLowerCase().includes(rule.nameContains.trim().toLowerCase())) return false
  }
  return true
}

/**
 * Calcula que se moveria, sin mover nada.
 *
 * Es siempre el paso previo a aplicar: el usuario ve la tabla completa antes de
 * que nadie toque el disco.
 */
export function planMoves(rules: FileRule[], allowedRoots: string[]): MovePlan {
  const moves: PlannedMove[] = []
  /** Nombres ya reservados en cada destino dentro de este mismo plan. */
  const reserved = new Map<string, Set<string>>()
  let skipped = 0
  let examined = 0

  for (const rule of rules.filter((r) => r.enabled)) {
    // Una regla que apunte fuera de las carpetas autorizadas se ignora entera
    // en vez de tumbar el plan: puede venir de una configuracion vieja.
    try {
      assertAllowed(allowedRoots, rule.source)
      assertAllowed(allowedRoots, rule.destination)
    } catch {
      continue
    }

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(rule.source, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (examined >= MAX_FILES) break
      // Solo archivos sueltos: nada de recorrer subcarpetas ni mover directorios.
      if (!entry.isFile()) continue
      examined++

      if (!matches(rule, entry.name)) {
        skipped++
        continue
      }

      const from = path.join(rule.source, entry.name)
      // Si otra regla anterior ya reclamo este archivo, gana la primera.
      if (moves.some((m) => m.from === from)) continue

      const taken = reserved.get(rule.destination) ?? new Set<string>()
      let finalName = entry.name
      try {
        finalName = availableName(rule.destination, entry.name)
        while (taken.has(finalName)) {
          const extension = path.extname(finalName)
          finalName = `${path.basename(finalName, extension)} (2)${extension}`
        }
      } catch {
        continue
      }
      taken.add(finalName)
      reserved.set(rule.destination, taken)

      moves.push({
        from,
        to: path.join(rule.destination, finalName),
        rule: rule.name,
        ...(finalName !== entry.name ? { renamedTo: finalName } : {})
      })
    }
  }

  return { id: randomUUID(), moves, skipped, createdAt: new Date().toISOString() }
}
