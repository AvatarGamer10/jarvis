import fs from 'node:fs'
import path from 'node:path'
import type { MovePlan, PlannedMove, UndoBatch } from '@shared/types'
import { assertAllowed, availableName } from './paths'

export interface ApplyOutcome {
  moved: PlannedMove[]
  failed: { move: PlannedMove; error: string }[]
}

/**
 * Mueve un archivo. `rename` falla con EXDEV si origen y destino estan en
 * discos distintos (muy comun: Descargas en C: y los apuntes en D:), asi que
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
 * Ejecuta un plan ya aprobado por el usuario.
 *
 * Cada movimiento se vuelve a validar contra las carpetas autorizadas: entre
 * que se calculo el plan y que el usuario le dio a confirmar puede haber
 * cambiado la configuracion, y el plan viene de fuera de esta funcion.
 */
export function applyPlan(plan: MovePlan, allowedRoots: string[]): ApplyOutcome {
  const moved: PlannedMove[] = []
  const failed: ApplyOutcome['failed'] = []

  for (const move of plan.moves) {
    try {
      assertAllowed(allowedRoots, move.from)
      assertAllowed(allowedRoots, move.to)

      if (!fs.existsSync(move.from)) {
        throw new Error('El archivo ya no esta donde estaba.')
      }

      // El nombre libre se recalcula ahora: entre el plan y la ejecucion
      // puede haber aparecido un archivo con ese nombre.
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

/** Devuelve cada archivo a donde estaba. */
export function undoBatch(batch: UndoBatch, allowedRoots: string[]): ApplyOutcome {
  const moved: PlannedMove[] = []
  const failed: ApplyOutcome['failed'] = []

  for (const move of batch.moves) {
    // Al deshacer, origen y destino intercambian papeles.
    const reverse: PlannedMove = { from: move.to, to: move.from, rule: move.rule }
    try {
      assertAllowed(allowedRoots, reverse.from)
      assertAllowed(allowedRoots, reverse.to)

      if (!fs.existsSync(reverse.from)) {
        throw new Error('El archivo ya no esta en el destino: puede que lo hayas movido tu.')
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
