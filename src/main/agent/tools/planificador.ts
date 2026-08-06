import { z } from 'zod'
import { calcular, type Bloque } from './planificador-core'
import type { Tool } from './types'

/**
 * Reparte las tareas pendientes por los huecos libres del calendario.
 *
 * Es la funcion que separa un asistente de una lista de tareas: ya sabiamos
 * que tienes que entregar y cuando, y que hay en tu calendario. Faltaba cruzar
 * las dos cosas y decir *cuando* hacer cada cosa.
 *
 * El calculo vive en planificador-core.ts para poder probarlo sin arrastrar
 * media aplicacion.
 */

/** Nadie planifica con mas de dos semanas de antelacion util. */
const DIAS_MAX = 14

const formatoDia = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'short'
})
const formatoHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

const args = z.object({
  dias: z.number().int().min(1).max(DIAS_MAX).optional()
})

/** Los bloques ya calculados viajan con los argumentos entre prepare y execute. */
type Args = z.infer<typeof args> & { bloques?: Bloque[] }

export const planificarEstudio: Tool<Args> = {
  name: 'plan_study',
  description:
    'Reparte las tareas pendientes en bloques de estudio por los huecos libres del calendario. ' +
    'Usala cuando el usuario pida organizarse, planificar la semana o saber cuando estudiar. ' +
    'Crea varios eventos de una vez; el usuario lo confirmara.',
  parameters: {
    type: 'object',
    properties: {
      dias: {
        type: 'number',
        description: 'Cuantos dias por delante planificar. Por defecto 7.'
      }
    },
    required: []
  },
  schema: args,
  requiresConfirmation: true,

  // Se calcula el reparto antes de preguntar, para poder ensenar los bloques
  // concretos en la tarjeta en vez de un "voy a planificar" sin contenido.
  async prepare(datos, ctx) {
    return { ...datos, bloques: await calcular(datos.dias ?? 7, ctx) }
  },

  describe(datos) {
    const bloques = datos.bloques ?? []
    if (bloques.length === 0) {
      return {
        description: 'No hay nada que planificar',
        details: ['O no tienes tareas pendientes, o no quedan huecos libres.']
      }
    }

    return {
      description: `Crear ${bloques.length} bloque(s) de estudio en tu calendario`,
      details: bloques.map(
        (b) =>
          `${formatoDia.format(b.inicio)} · ${formatoHora.format(b.inicio)}–${formatoHora.format(
            b.fin
          )} · ${b.tarea}`
      )
    }
  },

  async execute(datos, ctx) {
    const bloques = datos.bloques ?? (await calcular(datos.dias ?? 7, ctx))

    if (bloques.length === 0) {
      return {
        summary: 'No habia huecos libres o no tienes tareas pendientes.',
        data: { creados: 0 }
      }
    }

    let creados = 0
    const fallos: string[] = []

    for (const b of bloques) {
      try {
        await ctx.calendar.createEvent({
          title: `Estudiar: ${b.tarea}`,
          start: b.inicio.toISOString(),
          end: b.fin.toISOString(),
          description: b.asignatura ? `Asignatura: ${b.asignatura}` : undefined
        })
        creados++
      } catch (err) {
        // Un evento que falla no debe tumbar el resto del plan.
        fallos.push((err as Error).message)
      }
    }

    return {
      summary:
        `${creados} bloque(s) de estudio en el calendario` +
        (fallos.length > 0 ? `, ${fallos.length} no se pudieron crear.` : '.'),
      data: { creados, fallos: fallos.slice(0, 2) }
    }
  }
}
