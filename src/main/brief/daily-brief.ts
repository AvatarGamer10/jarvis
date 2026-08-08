import type { BriefTask, DailyBrief } from '@shared/types'
import type { LLMProvider } from '../agent/provider'
import type { CalendarService } from '../integrations/calendar'
import type { ClassroomService } from '../integrations/classroom'
import type { ExamenService } from '../tasks/exams'
import type { ManualTaskService } from '../tasks/manual-tasks'

/** How many days ahead count as "coming up soon". */
const SOON_DAYS = 3

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Calendar days until the date. Negative once passed, null if there is none. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null

  const due = new Date(parsed)
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - startOfToday().getTime()) / 86_400_000)
}

const plural = (n: number, uno: string, varios: string): string =>
  `${n} ${n === 1 ? uno : varios}`

/**
 * Assembles the day's brief from the three sources.
 *
 * None of them is required: if the calendar fails or Classroom is blocked by
 * the school, the brief still goes out with whatever there is. A partial brief
 * is useful; one that never appears because a source failed is not.
 */
export class BriefService {
  constructor(
    private readonly calendar: CalendarService,
    private readonly classroom: ClassroomService,
    private readonly tasks: ManualTaskService,
    private readonly exams: ExamenService,
    private readonly llm: LLMProvider
  ) {}

  /**
   * Exams that have not happened yet, as brief entries.
   *
   * Marked ones are left out, and so are past ones with no grade: an exam you
   * have already sat is not outstanding, you have just not written down the
   * result.
   */
  private examenesPendientes(): BriefTask[] {
    const today = startOfToday().getTime()
    return this.exams
      .list()
      .filter((e) => e.grade === null && Date.parse(e.date) >= today)
      .map((e) => ({
        title: `Exam: ${e.title}`,
        subject: e.subject,
        dueDate: e.date,
        source: 'exam' as const
      }))
  }

  /**
   * Counts what is urgent, without touching the calendar or the model.
   *
   * Used by the floating orb, which asks every few minutes: building the whole
   * brief to paint one number would spend network and battery for nothing.
   */
  async counts(): Promise<{ today: number; overdue: number }> {
    const manual = this.tasks.list().filter((t) => !t.done)
    const classroom = await this.safeClassroom()

    const fechas = [...manual.map((t) => t.dueDate), ...classroom.map((t) => t.dueDate)]

    let today = 0
    let overdue = 0
    for (const fecha of fechas) {
      const dias = daysUntil(fecha)
      if (dias === null) continue
      if (dias < 0) overdue++
      else if (dias === 0) today++
    }

    // An exam today is the most urgent thing there is. Past ones with no grade
    // do not count as overdue: you sat them, you just have not written the
    // result down, and nagging about that daily would turn the count to noise.
    for (const exam of this.examenesPendientes()) {
      if (daysUntil(exam.dueDate) === 0) today++
    }

    return { today, overdue }
  }

  async build(withSummary = true): Promise<DailyBrief> {
    const [events, classroomTasks] = await Promise.all([
      this.safeEvents(),
      this.safeClassroom()
    ])

    const manual: BriefTask[] = this.tasks
      .list()
      .filter((t) => !t.done)
      .map((t) => ({
        title: t.title,
        subject: t.subject,
        dueDate: t.dueDate,
        source: 'manual' as const
      }))

    const all = [...this.examenesPendientes(), ...classroomTasks, ...manual]

    const overdue: BriefTask[] = []
    const dueToday: BriefTask[] = []
    const dueSoon: BriefTask[] = []

    for (const task of all) {
      const days = daysUntil(task.dueDate)
      if (days === null) continue
      if (days < 0) overdue.push(task)
      else if (days === 0) dueToday.push(task)
      else if (days <= SOON_DAYS) dueSoon.push(task)
    }

    // Same day: the exam first. It is the thing that cannot be put off.
    const byDate = (a: BriefTask, b: BriefTask): number => {
      const fechas = (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
      if (fechas !== 0) return fechas
      return (a.source === 'exam' ? 0 : 1) - (b.source === 'exam' ? 0 : 1)
    }
    overdue.sort(byDate)
    dueToday.sort(byDate)
    dueSoon.sort(byDate)

    const brief: DailyBrief = {
      date: new Date().toISOString(),
      events,
      dueToday,
      dueSoon,
      overdue,
      summary: null,
      headline: this.headline(events.length, dueToday, overdue.length)
    }

    if (withSummary) brief.summary = await this.safeSummary(brief)
    return brief
  }

  /** The notification sentence. Most urgent first, and no filler. */
  private headline(events: number, today: BriefTask[], overdue: number): string {
    // Exams are counted separately: calling an exam a "deadline" strips it of
    // exactly the weight it needs to carry in a one-line sentence.
    const exams = today.filter((t) => t.source === 'exam').length
    const entregas = today.length - exams

    const partes: string[] = []
    if (exams > 0) partes.push(`${plural(exams, 'EXAM today', 'EXAMS today')}`)
    if (overdue > 0) partes.push(`${plural(overdue, 'task late', 'tasks late')}`)
    if (entregas > 0) partes.push(`${plural(entregas, 'due today', 'due today')}`)
    if (events > 0) partes.push(`${plural(events, 'event', 'events')}`)

    if (partes.length === 0) return 'Nothing due today.'
    return partes.join(' · ')
  }

  private async safeEvents(): Promise<DailyBrief['events']> {
    try {
      const from = startOfToday()
      const to = new Date(from)
      to.setDate(to.getDate() + 1)
      return await this.calendar.listEvents(from.toISOString(), to.toISOString())
    } catch (err) {
      console.error('[brief] no calendar:', (err as Error).message)
      return []
    }
  }

  private async safeClassroom(): Promise<BriefTask[]> {
    try {
      const pending = await this.classroom.listPending()
      return pending.map((a) => ({
        title: a.title,
        subject: a.courseName,
        dueDate: a.dueDate,
        source: 'classroom' as const,
        link: a.link
      }))
    } catch (err) {
      console.error('[brief] no Classroom:', (err as Error).message)
      return []
    }
  }

  /**
   * The model's write-up. It is a bonus: with no model reachable, the
   * interface still shows all the structured data underneath.
   */
  private async safeSummary(brief: DailyBrief): Promise<string | null> {
    if (brief.events.length === 0 && brief.dueToday.length === 0 && brief.overdue.length === 0) {
      return null
    }

    const linea = (t: BriefTask): string =>
      `- ${t.title}${t.subject ? ` (${t.subject})` : ''}`

    const data = [
      brief.overdue.length > 0 ? `Late:\n${brief.overdue.map(linea).join('\n')}` : '',
      brief.dueToday.length > 0 ? `Due today:\n${brief.dueToday.map(linea).join('\n')}` : '',
      brief.dueSoon.length > 0 ? `Due soon:\n${brief.dueSoon.map(linea).join('\n')}` : '',
      brief.events.length > 0
        ? `Today's calendar:\n${brief.events.map((e) => `- ${e.title}`).join('\n')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const reply = await this.llm.complete({
        system:
          'You are Vilo, a student\'s assistant. Write their morning brief in English, ' +
          'second person, in two or three sentences at most. Lead with the most urgent ' +
          'thing and suggest where to start. No greeting and no lists: just prose. ' +
          'Invent nothing that is not in the data.',
        history: [{ role: 'user', text: data }],
        // No tools: all we want here is the writing.
        tools: []
      })
      return reply.text
    } catch (err) {
      console.error('[brief] no prose from the model:', (err as Error).message)
      return null
    }
  }
}
