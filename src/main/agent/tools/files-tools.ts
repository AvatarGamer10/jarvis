import path from 'node:path'
import { z } from 'zod'
import type { Tool } from './types'

/**
 * El agente nunca recibe rutas para mover: solo puede pedir un simulacro y
 * luego aprobar el plan por su id. Asi el modelo no puede fabricar un
 * movimiento hacia una carpeta arbitraria aunque se lo pidan con mana.
 */

const noArgs = z.object({})

export const filesPlan: Tool<z.infer<typeof noArgs>> = {
  name: 'files_plan',
  description:
    'Calcula que archivos se moverian al aplicar las reglas de organizacion, sin mover nada. ' +
    'Usala siempre antes de files_apply y ensena al usuario cuantos archivos son.',
  parameters: { type: 'OBJECT', properties: {}, required: [] },
  schema: noArgs,
  requiresConfirmation: false,
  async execute(_args, ctx) {
    const plan = ctx.organizer.plan()
    if (plan.moves.length === 0) {
      return {
        summary: 'No hay nada que ordenar con las reglas actuales.',
        data: { planId: plan.id, movimientos: 0 }
      }
    }
    return {
      summary: `${plan.moves.length} archivo(s) se moverian.`,
      data: {
        planId: plan.id,
        movimientos: plan.moves.length,
        ejemplos: plan.moves.slice(0, 5).map((m) => ({
          archivo: path.basename(m.from),
          hacia: path.basename(path.dirname(m.to)),
          regla: m.rule
        }))
      }
    }
  }
}

const applyArgs = z.object({
  planId: z.string().min(1, 'Hace falta el planId que devuelve files_plan.')
})

export const filesApply: Tool<z.infer<typeof applyArgs>> = {
  name: 'files_apply',
  description:
    'Aplica un plan de organizacion previamente calculado con files_plan. ' +
    'Mueve archivos de verdad, asi que el usuario lo tendra que confirmar.',
  parameters: {
    type: 'OBJECT',
    properties: {
      planId: { type: 'STRING', description: 'El planId devuelto por files_plan' }
    },
    required: ['planId']
  },
  schema: applyArgs,
  requiresConfirmation: true,
  describe() {
    return {
      description: 'Aplicar el plan de organizacion de carpetas',
      details: ['Los archivos se moveran segun tus reglas.', 'Podras deshacerlo despues.']
    }
  },
  async execute(args, ctx) {
    const outcome = ctx.organizer.apply(args.planId)
    const failed = outcome.failed.length
    return {
      summary:
        `${outcome.moved.length} archivo(s) movido(s)` +
        (failed > 0 ? `, ${failed} con problemas.` : '.'),
      data: {
        movidos: outcome.moved.length,
        fallidos: outcome.failed.map((f) => ({
          archivo: path.basename(f.move.from),
          motivo: f.error
        }))
      }
    }
  }
}

export const filesUndo: Tool<z.infer<typeof noArgs>> = {
  name: 'files_undo',
  description: 'Deshace el ultimo lote de archivos movidos, devolviendolos a su sitio original.',
  parameters: { type: 'OBJECT', properties: {}, required: [] },
  schema: noArgs,
  requiresConfirmation: true,
  describe() {
    return {
      description: 'Deshacer el ultimo movimiento de archivos',
      details: ['Cada archivo volvera a la carpeta donde estaba.']
    }
  },
  async execute(_args, ctx) {
    const outcome = ctx.organizer.undoLast()
    return {
      summary: `${outcome.moved.length} archivo(s) devuelto(s) a su sitio.`,
      data: { devueltos: outcome.moved.length, fallidos: outcome.failed.length }
    }
  }
}
