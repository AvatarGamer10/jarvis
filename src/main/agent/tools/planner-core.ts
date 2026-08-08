import type { BriefTask, CalendarEvent, Exam, ManualTask } from '@shared/types'

/**
 * Distributing study blocks. Pure, with no dependency on the rest of the app.
 *
 * Kept apart from the tool definition so it can be tested: the tool drags in
 * the whole service chain — and with it the settings and the credentials —
 * which does not compile outside Electron. What is left here is date
 * arithmetic, which is exactly what is worth covering.
 */

/** The part of the day when studying makes sense. */
export const START_HOUR = 16
export const END_HOUR = 22
/** Length of each block, in minutes. Four hours straight does not work. */
export const MIN_BLOCK = 60
/** Break between blocks on the same day. */
const BREAK_MINUTES = 15

export interface Block {
  start: Date
  end: Date
  task: string
  subject: string
}

/**
 * The least the planner needs.
 *
 * Declared here rather than using the full tool context: asking for
 * only what is used makes the scope obvious and allows testing with a stub.
 */
export interface PlannerSources {
  calendar: { listEvents(desde: string, hasta: string): Promise<CalendarEvent[]> }
  classroom: { listPending(): Promise<{ title: string; courseName: string; dueDate: string | null }[]> }
  tasks: { list(): ManualTask[] }
  exams: { list(): Exam[] }
}

const chocan = (aIni: Date, aFin: Date, bIni: Date, bFin: Date): boolean =>
  aIni < bFin && bIni < aFin

/**
 * A day's free gaps, respecting what is already in the calendar.
 *
 * All-day events block nothing: a birthday marked that way does not mean you
 * cannot study that afternoon.
 */
function huecosDelDia(dia: Date, eventos: CalendarEvent[]): { start: Date; end: Date }[] {
  const ocupado = eventos
    .filter((e) => !e.allDay)
    .map((e) => ({ start: new Date(e.start), end: new Date(e.end) }))
    .filter((e) => !Number.isNaN(e.start.getTime()) && !Number.isNaN(e.end.getTime()))

  const huecos: { start: Date; end: Date }[] = []
  const ahora = new Date()

  for (let hora = START_HOUR; hora + MIN_BLOCK / 60 <= END_HOUR; ) {
    const start = new Date(dia)
    start.setHours(Math.floor(hora), (hora % 1) * 60, 0, 0)
    const end = new Date(start.getTime() + MIN_BLOCK * 60_000)

    if (end.getHours() > END_HOUR || (end.getHours() === END_HOUR && end.getMinutes() > 0)) break

    // Nada de proponer blocks en el pasado.
    if (end <= ahora) {
      hora += 0.5
      continue
    }

    if (!ocupado.some((o) => chocan(start, end, o.start, o.end))) {
      huecos.push({ start, end })
      hora += (MIN_BLOCK + BREAK_MINUTES) / 60
    } else {
      hora += 0.5
    }
  }

  return huecos
}

/**
 * Cuantos blocks merece cada cosa.
 *
 * No attempt is made to guess the real effort: there is no data for it, and
 * feigning precision would be worse than dividing it simply and letting the
 * user
 * ajuste en la confirmacion.
 *
 * Exams get more because they cannot be done the night before: a deadline is
 * finished in one sitting, an exam needs revision spread out.
 */
function bloquesPorTarea(task: BriefTask): number {
  const exam = task.source === 'exam'
  if (!task.dueDate) return 1

  const dias = Math.ceil((Date.parse(task.dueDate) - Date.now()) / 86_400_000)
  if (exam) return dias <= 3 ? 3 : 2
  return dias <= 3 ? 2 : 1
}

/**
 * The tie-break when two things fall on the same day: the exam first.
 *
 * If Friday has both an exam and a deadline, the study time goes to the exam.
 * The deadline can be finished off on Thursday night; the exam cannot.
 */
const priority = (t: BriefTask): number => (t.source === 'exam' ? 0 : 1)

/**
 * A day key in local time.
 *
 * Slicing the ISO string would give the day in UTC, and a deadline at one in
 * the
 * madrugada caeria en el dia anterior.
 */
function diaLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** Everything competing for study time, ordered by urgency. */
async function pending(fuentes: PlannerSources): Promise<BriefTask[]> {
  const propias: BriefTask[] = fuentes.tasks
    .list()
    .filter((t) => !t.done)
    .map((t) => ({
      title: t.title,
      subject: t.subject,
      dueDate: t.dueDate,
      source: 'manual' as const
    }))

  // Marked ones are excluded: revising for an exam that already has a grade no
  // sirve de nada.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exams: BriefTask[] = fuentes.exams
    .list()
    .filter((e) => e.grade === null && Date.parse(e.date) >= today.getTime())
    .map((e) => ({
      title: e.title,
      subject: e.subject,
      dueDate: e.date,
      source: 'exam' as const
    }))

  let deClassroom: BriefTask[] = []
  try {
    deClassroom = (await fuentes.classroom.listPending()).map((a) => ({
      title: a.title,
      subject: a.courseName,
      dueDate: a.dueDate,
      source: 'classroom' as const
    }))
  } catch {
    // Classroom may be blocked by the school; that does not stop planning.
  }

  return [...exams, ...propias, ...deClassroom].sort((a, b) => {
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1

    // The day is compared, not the instant: a deadline at 23:59 and an exam at
    // 09:00 on the same date are "the same day", and there the exam wins.
    const diaA = diaLocal(a.dueDate)
    const diaB = diaLocal(b.dueDate)
    if (diaA !== diaB) return diaA.localeCompare(diaB)
    return priority(a) - priority(b)
  })
}

export async function planBlocks(dias: number, fuentes: PlannerSources): Promise<Block[]> {
  const desde = new Date()
  desde.setHours(0, 0, 0, 0)
  const hasta = new Date(desde)
  hasta.setDate(hasta.getDate() + dias)

  const [eventos, tareas] = await Promise.all([
    // With no calendar, every hour counts as free: better to propose something
    // reviewable than to propose nothing.
    fuentes.calendar.listEvents(desde.toISOString(), hasta.toISOString()).catch(() => []),
    pending(fuentes)
  ])

  if (tareas.length === 0) return []

  const cola: BriefTask[] = []
  for (const t of tareas) {
    for (let i = 0; i < bloquesPorTarea(t); i++) cola.push(t)
  }

  const blocks: Block[] = []

  for (let d = 0; d < dias && cola.length > 0; d++) {
    const dia = new Date(desde)
    dia.setDate(dia.getDate() + d)

    const delDia = eventos.filter((e) => new Date(e.start).toDateString() === dia.toDateString())

    for (const hueco of huecosDelDia(dia, delDia)) {
      if (cola.length === 0) break

      // Looks for the first task in the queue that can still be studied on ese
      // hueco: si el bloque cae despues de la dueDate, no sirve de nada.
      const indice = cola.findIndex(
        (t) => !t.dueDate || hueco.end.getTime() <= Date.parse(t.dueDate)
      )
      if (indice === -1) continue

      const [task] = cola.splice(indice, 1)
      blocks.push({
        start: hueco.start,
        end: hueco.end,
        task: task.title,
        subject: task.subject
      })
    }
  }

  return blocks
}
