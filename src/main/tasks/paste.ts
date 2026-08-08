import { z } from 'zod'
import type { LLMProvider } from '../agent/provider'
import { parseText, type PastedTask } from './paste-core'

/**
 * Reads a list pasted out of Classroom.
 *
 * The line-by-line parse always runs — it is instant and never fails — and the
 * model is asked as well. If the model comes back with something valid, its
 * answer wins: it understands split titles, dates written oddly, and decorative
 * lines the fixed rules do not cover. If there is no model, or it answers with
 * nonsense, the line parse is still there and the feature still works.
 *
 * Nothing is ever saved here. This only proposes.
 */

/** Ceiling on accepted text. A Classroom screen is nowhere near this. */
const MAX_CHARACTERS = 12_000

const schema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        subject: z.string().optional(),
        dueDate: z.string().nullable().optional()
      })
    )
    .max(40)
})

/**
 * The instruction is in English; the text it reads is usually Spanish.
 *
 * That is deliberate and it works: models handle the pairing without trouble,
 * and the field names have to match the schema above, which is English. The
 * examples of what to ignore stay in Spanish because they are literally what
 * appears on the page.
 */
const INSTRUCTION = `You extract assignments from text copied out of Google Classroom.

Reply with ONLY a JSON object, no explanation and no markdown, in this shape:
{"tasks":[{"title":"...","subject":"...","dueDate":"2026-08-10T23:59:00.000Z"}]}

Rules:
- "title" is the thing that has to be done. Required.
- "subject" is the subject or the course name. Empty string if it is not there.
- "dueDate" is the deadline in ISO 8601, or null if the text does not say.
- Do not invent assignments, dates or subjects that are not in the text.
- Ignore anything that is not an assignment: headers, counters, "Publicado el
  ...", "Ver detalles", and statuses like "Entregado" or "Falta".
- The posted date is NOT the due date.`

export class PasteService {
  constructor(private readonly llm: LLMProvider) {}

  async parse(text: string): Promise<{ tasks: PastedTask[]; source: 'model' | 'text' }> {
    const trimmed = text.slice(0, MAX_CHARACTERS).trim()
    if (trimmed.length === 0) return { tasks: [], source: 'text' }

    const byLines = parseText(trimmed)

    try {
      const fromModel = await this.askModel(trimmed)
      // If the model finds nothing and the rules do, the rules win: an empty
      // list is never a better answer than one you can look over.
      if (fromModel.length > 0) return { tasks: fromModel, source: 'model' }
    } catch (err) {
      console.error('[paste] no model:', (err as Error).message)
    }

    return { tasks: byLines, source: 'text' }
  }

  private async askModel(text: string): Promise<PastedTask[]> {
    const reply = await this.llm.complete({
      system: INSTRUCTION,
      history: [{ role: 'user', text }],
      // No tools: all we want here is for it to structure what it was given.
      tools: []
    })

    const json = extractJson(reply.text ?? '')
    if (!json) throw new Error('The model did not return JSON.')

    const validated = schema.safeParse(json)
    if (!validated.success) throw new Error("The model's JSON is not the expected shape.")

    return validated.data.tasks
      .map((task) => ({
        title: task.title.trim(),
        subject: (task.subject ?? '').trim(),
        // A date the model invents badly is dropped, not passed on.
        dueDate:
          task.dueDate && !Number.isNaN(Date.parse(task.dueDate))
            ? new Date(task.dueDate).toISOString()
            : null
      }))
      .filter((task) => task.title.length > 0)
  }
}

/**
 * Pulls the JSON object out of the reply.
 *
 * Local models almost always wrap the JSON in a code block, or put a polite
 * sentence in front of it, however firmly they are asked not to. This looks for
 * the first balanced object rather than trusting the whole reply to be JSON.
 */
function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const c = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }

    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }

  return null
}
