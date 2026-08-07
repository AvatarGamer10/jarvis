import { z } from 'zod'
import { NOTA_MAX, NOTA_MIN, porAsignatura, proximos } from '../../tasks/notas-core'
import type { Tool } from './types'

/**
 * Herramientas de examenes y notas.
 *
 * Separadas de las de tareas porque responden a preguntas distintas: las tareas
 * son "que tengo que hacer", los examenes son "que tengo que estudiar" y "como
 * voy". El modelo elige mejor con dos grupos claros que con uno grande.
 */

const fecha = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
})

const listArgs = z.object({
  soloProximos: z.boolean().optional()
})

export const examsList: Tool<z.infer<typeof listArgs>> = {
  name: 'exams_list',
  description:
    'Consulta los examenes del usuario y sus notas, con la media por asignatura. ' +
    'Usala cuando pregunte por examenes, por como lleva una asignatura o por su media.',
  parameters: {
    type: 'object',
    properties: {
      soloProximos: {
        type: 'boolean',
        description: 'Si es true, solo los que aun no han pasado. Por defecto false.'
      }
    },
    required: []
  },
  schema: listArgs,
  requiresConfirmation: false,
  async execute(args, ctx) {
    const todos = ctx.examenes.list()
    const visibles = args.soloProximos ? proximos(todos) : todos

    return {
      summary: args.soloProximos
        ? `${visibles.length} examen(es) por delante.`
        : `${visibles.length} examen(es) apuntado(s).`,
      data: {
        examenes: visibles.map((e) => ({
          titulo: e.title,
          asignatura: e.subject || null,
          fecha: e.date,
          nota: e.grade,
          peso: e.weight
        })),
        // La media va siempre: si el usuario pregunta por sus examenes, la
        // siguiente pregunta es como va, y asi no hace falta una segunda vuelta.
        porAsignatura: porAsignatura(todos).map((r) => ({
          asignatura: r.asignatura,
          media: r.media,
          ponderada: r.ponderada,
          hechos: r.hechos,
          pendientes: r.pendientes,
          necesarioParaAprobar: r.necesario
        }))
      }
    }
  }
}

const addArgs = z.object({
  titulo: z.string().min(1, 'El examen necesita un titulo.'),
  asignatura: z.string().optional(),
  fecha: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'La fecha del examen no tiene un formato valido.'
  }),
  peso: z.number().min(1).max(100).optional()
})

export const examsAdd: Tool<z.infer<typeof addArgs>> = {
  name: 'exams_add',
  description:
    'Apunta un examen con su fecha. Usala cuando el usuario diga que tiene un examen, ' +
    'control o prueba. El usuario lo confirmara en pantalla, asi que no preguntes tu antes.',
  parameters: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Nombre del examen o que entra' },
      asignatura: { type: 'string', description: 'Asignatura, si se sabe' },
      fecha: { type: 'string', description: 'Fecha del examen en ISO 8601' },
      peso: {
        type: 'number',
        description: 'Cuanto cuenta sobre la nota de la evaluacion, en porcentaje'
      }
    },
    required: ['titulo', 'fecha']
  },
  schema: addArgs,
  requiresConfirmation: true,
  describe(args) {
    const details = [`Fecha: ${fecha.format(new Date(args.fecha))}`]
    if (args.asignatura) details.unshift(`Asignatura: ${args.asignatura}`)
    if (args.peso) details.push(`Cuenta un ${args.peso}% de la evaluacion`)
    return { description: `Apuntar el examen "${args.titulo}"`, details }
  },
  async execute(args, ctx) {
    const examen = ctx.examenes.add({
      title: args.titulo,
      subject: args.asignatura,
      date: args.fecha,
      weight: args.peso ?? null
    })
    return { summary: `Examen "${examen.title}" apuntado.`, data: { titulo: examen.title } }
  }
}

const gradeArgs = z.object({
  examen: z.string().min(1, 'Dime de que examen es la nota.'),
  nota: z.number().min(NOTA_MIN).max(NOTA_MAX)
})

export const examsGrade: Tool<z.infer<typeof gradeArgs>> = {
  name: 'exams_grade',
  description:
    'Apunta la nota de un examen ya hecho, buscandolo por su titulo o asignatura. ' +
    `La nota va de ${NOTA_MIN} a ${NOTA_MAX}.`,
  parameters: {
    type: 'object',
    properties: {
      examen: { type: 'string', description: 'Titulo del examen o asignatura' },
      nota: { type: 'number', description: `Nota obtenida, de ${NOTA_MIN} a ${NOTA_MAX}` }
    },
    required: ['examen', 'nota']
  },
  schema: gradeArgs,
  requiresConfirmation: true,
  describe(args) {
    return {
      description: `Poner un ${args.nota} en "${args.examen}"`,
      details: ['Cambiara tu media de la asignatura']
    }
  },
  async execute(args, ctx) {
    const encontrado = ctx.examenes.findByText(args.examen)
    if (!encontrado) {
      // Como dato y no como excepcion: asi el modelo puede decirselo al usuario
      // y ofrecerle la lista, en vez de cortarse.
      return {
        summary: `No he encontrado ningun examen que se parezca a "${args.examen}".`,
        data: { encontrado: false }
      }
    }

    ctx.examenes.update(encontrado.id, { grade: args.nota })
    const resumen = porAsignatura(ctx.examenes.list()).find(
      (r) => r.asignatura.toLowerCase() === encontrado.subject.trim().toLowerCase()
    )

    return {
      summary:
        `Un ${args.nota} en "${encontrado.title}".` +
        (resumen?.media !== null && resumen !== undefined
          ? ` Media de ${resumen.asignatura}: ${resumen.media}.`
          : ''),
      data: { encontrado: true, media: resumen?.media ?? null }
    }
  }
}
