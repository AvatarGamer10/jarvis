import { z } from 'zod'
import type { LLMProvider } from '../agent/provider'
import { interpretarTexto, type TareaPegada } from './pegar-core'

/**
 * Interpreta una lista pegada de Classroom.
 *
 * Se hace siempre el analisis por lineas, que es inmediato y no falla nunca, y
 * ademas se le pregunta al modelo. Si el modelo responde algo valido, se usa lo
 * suyo: entiende titulos partidos, fechas escritas raro y lineas de adorno que
 * las reglas fijas no cubren. Si no hay modelo o contesta cualquier cosa, queda
 * el analisis por lineas y la funcion sigue estando disponible.
 *
 * En ningun caso se guarda nada: esto solo propone.
 */

/** Techo de texto aceptado. Una pantalla de Classroom no llega ni de lejos. */
const MAX_CARACTERES = 12_000

const esquema = z.object({
  tareas: z
    .array(
      z.object({
        titulo: z.string().min(1),
        asignatura: z.string().optional(),
        entrega: z.string().nullable().optional()
      })
    )
    .max(40)
})

const INSTRUCCION = `Extraes tareas de un texto copiado de Google Classroom.

Responde SOLO con un objeto JSON, sin explicaciones y sin markdown, con esta forma:
{"tareas":[{"titulo":"...","asignatura":"...","entrega":"2026-08-10T23:59:00.000Z"}]}

Reglas:
- "titulo" es lo que hay que hacer. Obligatorio.
- "asignatura" es la materia o el nombre del curso. Cadena vacia si no aparece.
- "entrega" es la fecha limite en ISO 8601, o null si el texto no la dice.
- No inventes tareas, fechas ni asignaturas que no esten en el texto.
- Ignora lo que no sea una tarea: cabeceras, contadores, "Publicado el ...",
  "Ver detalles", estados como "Entregado" o "Falta".
- La fecha de publicacion NO es la fecha de entrega.`

export class PegarService {
  constructor(private readonly llm: LLMProvider) {}

  async interpretar(
    texto: string
  ): Promise<{ tareas: TareaPegada[]; fuente: 'modelo' | 'texto' }> {
    const recortado = texto.slice(0, MAX_CARACTERES).trim()
    if (recortado.length === 0) return { tareas: [], fuente: 'texto' }

    const porLineas = interpretarTexto(recortado)

    try {
      const delModelo = await this.preguntarAlModelo(recortado)
      // Si el modelo no saca nada y las reglas si, manda lo que hay: una lista
      // vacia nunca es mejor respuesta que una lista revisable.
      if (delModelo.length > 0) return { tareas: delModelo, fuente: 'modelo' }
    } catch (err) {
      console.error('[pegar] sin modelo:', (err as Error).message)
    }

    return { tareas: porLineas, fuente: 'texto' }
  }

  private async preguntarAlModelo(texto: string): Promise<TareaPegada[]> {
    const respuesta = await this.llm.complete({
      system: INSTRUCCION,
      history: [{ role: 'user', text: texto }],
      // Sin herramientas: aqui solo queremos que estructure lo que le damos.
      tools: []
    })

    const json = extraerJson(respuesta.text ?? '')
    if (!json) throw new Error('El modelo no ha devuelto JSON.')

    const validado = esquema.safeParse(json)
    if (!validado.success) throw new Error('El JSON del modelo no tiene la forma esperada.')

    return validado.data.tareas
      .map((t) => ({
        titulo: t.titulo.trim(),
        asignatura: (t.asignatura ?? '').trim(),
        // Una fecha que el modelo se invente mal se descarta, no se propaga.
        entrega:
          t.entrega && !Number.isNaN(Date.parse(t.entrega))
            ? new Date(t.entrega).toISOString()
            : null
      }))
      .filter((t) => t.titulo.length > 0)
  }
}

/**
 * Saca el objeto JSON de la respuesta.
 *
 * Los modelos locales casi siempre envuelven el JSON en un bloque de codigo o
 * le ponen delante una frase de cortesia, por mucho que se les pida lo
 * contrario. Se busca el primer objeto equilibrado en vez de confiar en que la
 * respuesta entera sea JSON.
 */
function extraerJson(texto: string): unknown {
  const inicio = texto.indexOf('{')
  if (inicio === -1) return null

  let profundidad = 0
  let enCadena = false
  let escapado = false

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i]

    if (enCadena) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') enCadena = false
      continue
    }

    if (c === '"') enCadena = true
    else if (c === '{') profundidad++
    else if (c === '}') {
      profundidad--
      if (profundidad === 0) {
        try {
          return JSON.parse(texto.slice(inicio, i + 1))
        } catch {
          return null
        }
      }
    }
  }

  return null
}
