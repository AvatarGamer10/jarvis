/**
 * Turns a list pasted out of Classroom into tasks.
 *
 * It exists because the school does not approve the application and the API is
 * closed, but copying and pasting the screen always works. The local model
 * does this same job better when it is available; this is what answers when it
 * is not, and it doubles as a reference to compare against.
 *
 * Pure and dependency-free: testable without Electron and without a model.
 */

export interface PastedTask {
  title: string
  subject: string
  /** ISO 8601, or null if the text had no date in it. */
  dueDate: string | null
}

/** Ceiling per paste. Nobody has 40 assignments; beyond that it is stray text. */
const MAX_TASKS = 40

/** The longest a line can be and still be a subject. */
const MAX_SUBJECT_LENGTH = 45

const MONTHS: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6
}

/**
 * Lower case and unaccented, preserving the length.
 *
 * normalize('NFD') is not used: it splits accents into two characters and the
 * offsets would stop matching the original text, which is where the date has
 * to be cut out of to leave the title.
 */
const ACCENTS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', ç: 'c'
}
const normalise = (text: string): string =>
  text.toLowerCase().replace(/[áéíóúüñç]/g, (c) => ACCENTS[c])

/**
 * Lines Classroom puts around each assignment that are not assignments.
 *
 * "Publicado" y "asignado" llevan date propia, y es la de publicacion: si se
 * let the line through, that date would end up recorded as the due date.
 */
const NOISE = [
  'publicado',
  'asignado',
  'ver detalles',
  'ver tarea',
  'trabajo de clase',
  'sin fecha de entrega',
  'sin entregar',
  'entregado',
  'devuelto',
  'con retraso',
  'falta',
  'todo',
  'proximos',
  'tareas pendientes',
  'ver todo'
]

const isNoise = (line: string): boolean => {
  const n = normalise(line).trim()
  if (n.length === 0) return true
  // Numeros sueltos y separadores.
  if (/^[\d\s./·|—–-]+$/.test(n)) return true
  // Contadores de Classroom: "3 de 5".
  if (/^\d{1,3}\s+de\s+\d{1,3}$/.test(n)) return true
  return NOISE.some((r) => n === r || n.startsWith(`${r} `) || n.includes(r))
}

/**
 * Labels that come before the date and are not part of the title.
 *
 * They are trimmed from the original text, which arrives capitalised ("Fecha
 * de entrega:"), hence the `i` flag. Without it only the lowercase form in the
 * final y el title se quedaba en "Fecha de".
 */
const DATE_LABELS = /\b(fecha de entrega|fecha limite|entrega|vence|para el)\s*:?\s*/gi

interface FoundDate {
  date: Date | null
  /** What is left of the line once the date and its label are removed. */
  rest: string
}

/**
 * Pulls the date out of a line and returns the rest.
 *
 * Formats are tried most explicit first, because "8/8" also matches
 * inside "8/8/2026", and taking the first match would lose the year.
 */
export function findDate(line: string, today: Date = new Date()): FoundDate {
  const n = normalise(line)

  const patterns: { re: RegExp; build: (m: RegExpExecArray) => Date | null }[] = [
    // 8 de agosto de 2026 · 8 ago · 8 de ago.
    {
      re: /\b(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?(?:\s*(?:de\s*)?(\d{4}))?/,
      build: (m) => withYear(Number(m[1]), MONTHS[m[2]], m[3] ? Number(m[3]) : null, today)
    },
    // 8/8/2026 · 08-08-26 · 8/8
    {
      re: /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/,
      build: (m) => {
        const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null
        return withYear(Number(m[1]), Number(m[2]) - 1, year, today)
      }
    },
    {
      re: /\b(pasado manana|manana|hoy)\b/,
      build: (m) => {
        const d = atMidnight(today)
        d.setDate(d.getDate() + (m[1] === 'hoy' ? 0 : m[1] === 'manana' ? 1 : 2))
        return d
      }
    },
    {
      re: /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/,
      build: (m) => nextWeekday(WEEKDAYS[m[1]], today)
    }
  ]

  for (const { re, build } of patterns) {
    const m = re.exec(n)
    if (!m) continue

    const date = build(m)
    if (!date) continue

    // Cut from the original text, not the normalised one: the offsets
    // coinciden porque normalise conserva la longitud.
    const rest = (line.slice(0, m.index) + line.slice(m.index + m[0].length))
      .replace(DATE_LABELS, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s·•|—–-]+|[\s·•|—–-]+$/g, '')
      .trim()

    return { date, rest }
  }

  return { date: null, rest: line.replace(DATE_LABELS, ' ').trim() }
}

const atMidnight = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Completa el year cuando el text no lo trae.
 *
 * Classroom writes "15 ene" with no year. Always using the current one would
 * put that date
 * eleven months in the past if it is December, so a date that lands a long way
 * back is read as next year's.
 */
function withYear(dia: number, mes: number, year: number | null, today: Date): Date | null {
  if (dia < 1 || dia > 31 || mes < 0 || mes > 11) return null

  const candidata = new Date(year ?? today.getFullYear(), mes, dia)
  candidata.setHours(0, 0, 0, 0)
  if (candidata.getMonth() !== mes) return null // 31 de febrero y compania

  if (year === null) {
    const haceDosMeses = new Date(today)
    haceDosMeses.setMonth(haceDosMeses.getMonth() - 2)
    if (candidata < haceDosMeses) candidata.setFullYear(candidata.getFullYear() + 1)
  }

  return candidata
}

/** The next weekday with that name. Today counts as next. */
function nextWeekday(objetivo: number, today: Date): Date {
  const d = atMidnight(today)
  d.setDate(d.getDate() + ((objetivo - d.getDay() + 7) % 7))
  return d
}

/** End of day: that is when a deadline actually falls. */
function comoEntrega(date: Date): string {
  const d = new Date(date)
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}

const SEPARADORES = /\s*[·•|—–]\s*|\s+-\s+/

/**
 * Interpreta el text pegado.
 *
 * Classroom coloca cada tarea en varias lineas seguidas, normalmente title,
 * subject and date, but not always all three and not always in that order.
 * reglas son a proposito pocas y explicables:
 *
 * - A line with a date and text is a new task.
 * - A line with only a date completes the task above it.
 * - A short line with no date, right behind a task that has not yet been
 *   le ha puesto date, se toma como su subject.
 *
 * The last rule is the one that can go wrong: two titles in a row with no date
 * make the second pass for the first one's subject. Which is why none of this
 * is saved without the user seeing it and being able to correct it first.
 */
export function parseText(text: string, today: Date = new Date()): PastedTask[] {
  const tareas: PastedTask[] = []

  for (const cruda of text.split(/\r?\n/)) {
    const line = cruda.trim()
    if (line.length === 0 || isNoise(line)) continue

    const { date, rest } = findDate(line, today)
    const ultima = tareas[tareas.length - 1]

    // Solo date: es de la tarea de arriba.
    if (rest.length === 0) {
      if (date && ultima && ultima.dueDate === null) ultima.dueDate = comoEntrega(date)
      continue
    }

    const partes = rest.split(SEPARADORES).map((p) => p.trim()).filter(Boolean)
    const title = partes[0]
    const subject = partes[1] ?? ''

    const esAsignaturaDeLaAnterior =
      !date &&
      partes.length === 1 &&
      title.length <= MAX_SUBJECT_LENGTH &&
      ultima !== undefined &&
      ultima.subject === '' &&
      ultima.dueDate === null

    if (esAsignaturaDeLaAnterior) {
      ultima.subject = title
      continue
    }

    if (tareas.length >= MAX_TASKS) break

    tareas.push({
      title,
      subject,
      dueDate: date ? comoEntrega(date) : null
    })
  }

  return tareas
}
