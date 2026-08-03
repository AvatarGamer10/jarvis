import type { BriefTask, DailyBrief } from '@shared/types'
import type { LLMProvider } from '../agent/provider'
import type { CalendarService } from '../integrations/calendar'
import type { ClassroomService } from '../integrations/classroom'
import type { ManualTaskService } from '../tasks/manual-tasks'

/** Cuantos dias por delante cuentan como "viene pronto". */
const SOON_DAYS = 3

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Dias naturales hasta la fecha. Negativo si ya paso, null si no hay fecha. */
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
 * Reune el resumen del dia a partir de las tres fuentes.
 *
 * Ninguna es obligatoria: si el calendario falla o Classroom esta bloqueado por
 * el centro, el resumen sale igualmente con lo que haya. Un resumen a medias es
 * util; uno que no aparece porque una fuente fallo, no.
 */
export class BriefService {
  constructor(
    private readonly calendar: CalendarService,
    private readonly classroom: ClassroomService,
    private readonly tasks: ManualTaskService,
    private readonly llm: LLMProvider
  ) {}

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

    const all = [...classroomTasks, ...manual]

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

    const byDate = (a: BriefTask, b: BriefTask): number =>
      (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
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
      headline: this.headline(events.length, dueToday.length, overdue.length)
    }

    if (withSummary) brief.summary = await this.safeSummary(brief)
    return brief
  }

  /** Frase de la notificacion. Lo urgente primero, y nada de relleno. */
  private headline(events: number, today: number, overdue: number): string {
    const partes: string[] = []
    if (overdue > 0) partes.push(`${plural(overdue, 'tarea atrasada', 'tareas atrasadas')}`)
    if (today > 0) partes.push(`${plural(today, 'entrega hoy', 'entregas hoy')}`)
    if (events > 0) partes.push(`${plural(events, 'evento', 'eventos')}`)

    if (partes.length === 0) return 'Hoy no tienes nada pendiente.'
    return partes.join(' · ')
  }

  private async safeEvents(): Promise<DailyBrief['events']> {
    try {
      const from = startOfToday()
      const to = new Date(from)
      to.setDate(to.getDate() + 1)
      return await this.calendar.listEvents(from.toISOString(), to.toISOString())
    } catch (err) {
      console.error('[brief] sin calendario:', (err as Error).message)
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
      console.error('[brief] sin Classroom:', (err as Error).message)
      return []
    }
  }

  /**
   * Redaccion del resumen por el modelo. Es un extra: si no hay modelo
   * disponible, la interfaz muestra igualmente los datos estructurados.
   */
  private async safeSummary(brief: DailyBrief): Promise<string | null> {
    if (brief.events.length === 0 && brief.dueToday.length === 0 && brief.overdue.length === 0) {
      return null
    }

    const linea = (t: BriefTask): string =>
      `- ${t.title}${t.subject ? ` (${t.subject})` : ''}`

    const datos = [
      brief.overdue.length > 0 ? `Atrasadas:\n${brief.overdue.map(linea).join('\n')}` : '',
      brief.dueToday.length > 0 ? `Vencen hoy:\n${brief.dueToday.map(linea).join('\n')}` : '',
      brief.dueSoon.length > 0 ? `Vencen pronto:\n${brief.dueSoon.map(linea).join('\n')}` : '',
      brief.events.length > 0
        ? `Calendario de hoy:\n${brief.events.map((e) => `- ${e.title}`).join('\n')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const reply = await this.llm.complete({
        system:
          'Eres JARVIS, el asistente de un estudiante. Redacta su resumen de la manana en ' +
          'espanol, de tu, en dos o tres frases como maximo. Di primero lo mas urgente y ' +
          'sugiere por donde empezar. Nada de saludos ni de listas: solo el texto seguido. ' +
          'No inventes nada que no este en los datos.',
        history: [{ role: 'user', text: datos }],
        // Sin herramientas: aqui solo queremos que redacte.
        tools: []
      })
      return reply.text
    } catch (err) {
      console.error('[brief] sin redaccion del modelo:', (err as Error).message)
      return null
    }
  }
}
