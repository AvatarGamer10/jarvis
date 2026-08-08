import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FileRule, MovePlan, PlannedMove } from '@shared/types'
import { assertAllowed, availableName } from './paths'

/** Ceiling on files examined at once, so the app does not lock up. */
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
 * Works out what would move, without moving anything.
 *
 * Always the step before applying: the user sees the full table before anybody
 * touches the disk.
 */
export function planMoves(rules: FileRule[], allowedRoots: string[]): MovePlan {
  const moves: PlannedMove[] = []
  /** Names already claimed at each destination within this same plan. */
  const reserved = new Map<string, Set<string>>()
  let skipped = 0
  let examined = 0

  for (const rule of rules.filter((r) => r.enabled)) {
    // A rule pointing outside the authorised folders is ignored whole rather
    // than bringing the plan down: it may be left over from an old setup.
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
      // Loose files only: no walking into subfolders, no moving directories.
      if (!entry.isFile()) continue
      examined++

      if (!matches(rule, entry.name)) {
        skipped++
        continue
      }

      const from = path.join(rule.source, entry.name)
      // If an earlier rule already claimed this file, the first one wins.
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
