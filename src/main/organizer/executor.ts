import fs from 'node:fs'
import path from 'node:path'
import type { MovePlan, PlannedMove, UndoBatch } from '@shared/types'
import { assertAllowed, availableName } from './paths'

export interface ApplyOutcome {
  moved: PlannedMove[]
  failed: { move: PlannedMove; error: string }[]
}

/**
 * Moves a file. `rename` fails with EXDEV when source and destination are on
 * different disks — very common: Downloads on C: and notes on D: — so
 * en ese caso se copia y se borra el original.
 */
function moveFile(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  try {
    fs.renameSync(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL)
    fs.unlinkSync(from)
  }
}

/**
 * Runs a plan the user has already approved.
 *
 * Every move is validated against the authorised folders again: the settings
 * may have changed between the plan being calculated and the user pressing
 * confirm, and the plan comes from outside this function.
 */
export function applyPlan(plan: MovePlan, allowedRoots: string[]): ApplyOutcome {
  const moved: PlannedMove[] = []
  const failed: ApplyOutcome['failed'] = []

  for (const move of plan.moves) {
    try {
      assertAllowed(allowedRoots, move.from)
      assertAllowed(allowedRoots, move.to)

      if (!fs.existsSync(move.from)) {
        throw new Error('That file is no longer where it was.')
      }

      // The free name is recalculated now: a file with that name may have
      // appeared between the plan and its execution.
      const directory = path.dirname(move.to)
      fs.mkdirSync(directory, { recursive: true })
      const finalName = availableName(directory, path.basename(move.to))
      const destination = path.join(directory, finalName)

      moveFile(move.from, destination)
      moved.push({ ...move, to: destination })
    } catch (err) {
      failed.push({ move, error: (err as Error).message })
    }
  }

  return { moved, failed }
}

/** Puts every file back where it was. */
export function undoBatch(batch: UndoBatch, allowedRoots: string[]): ApplyOutcome {
  const moved: PlannedMove[] = []
  const failed: ApplyOutcome['failed'] = []

  for (const move of batch.moves) {
    // Al deshacer, from y to intercambian papeles.
    const reverse: PlannedMove = { from: move.to, to: move.from, rule: move.rule }
    try {
      assertAllowed(allowedRoots, reverse.from)
      assertAllowed(allowedRoots, reverse.to)

      if (!fs.existsSync(reverse.from)) {
        throw new Error('That file is no longer at the destination — you may have moved it yourself.')
      }

      const directory = path.dirname(reverse.to)
      fs.mkdirSync(directory, { recursive: true })
      const finalName = availableName(directory, path.basename(reverse.to))
      const destination = path.join(directory, finalName)

      moveFile(reverse.from, destination)
      moved.push({ ...reverse, to: destination })
    } catch (err) {
      failed.push({ move: reverse, error: (err as Error).message })
    }
  }

  return { moved, failed }
}
