import type { BriefTask, DailyBrief } from '@shared/types'
import type { LLMProvider } from '../agent/provider'
import type { CalendarService } from '../integrations/calendar'
import type { ClassroomService } from '../integrations/classroom'
import type { ExamenService } from '../tasks/examenes'
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
    private readonly examenes: ExamenService,
    private readonly llm: LLMProvider
  ) {}

  /**
   * Examenes que aun no han pasado, como entradas del resumen.
   *
   * Los ya corregidos quedan fuera, y los pasados sin nota tambien: un examen
   * que ya hiciste no es algo pendiente, solo te falta apuntar el resultado.
   */
  private examenesPendientes(): BriefTask[] {
    const hoy = startOfToday().getTime()
    return this.examenes
      .list()
      .filter((e) => e.grade === null && Date.parse(e.date) >= hoy)
      .map((e) => ({
        title: `Examen: ${e.title}`,
        subject: e.subject,
        dueDate: e.date,
        source: 'examen' as const
      }))
  }

  /**
   * Cuenta lo urgente, sin tocar el calendario ni el modelo.
   *
   * Lo usa el boton flotante, que pregunta cada pocos minutos: construir el
   * resumen entero para pintar un numero seria gastar red y bateria de mas.
   */
  async contadores(): Promise<{ hoy: number; atrasadas: number }> {
    const manual = this.tasks.list().filter((t) => !t.done)
    const classroom = await this.safeClassroom()

    const fechas = [...manual.map((t) => t.dueDate), ...classroom.map((t) => t.dueDate)]

    let hoy = 0
    let atrasadas = 0
    for (const fecha of fechas) {
      const dias = daysUntil(fecha)
      if (dias === null) continue
      if (dias < 0) atrasadas++
      else if (dias === 0) hoy++
    }

    // Un examen hoy es lo mas urgente que hay. Los pasados sin nota no cuentan
    // como atrasados: ya los hiciste, solo falta apuntar el resultado, y avisar
    // de eso cada dia convertiria el contador en ruido.
    for (const examen of this.examenesPendientes()) {
      if (daysUntil(examen.dueDate) === 0) hoy++
    }

    return { hoy, atrasadas }
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

    // Mismo dia: primero el examen. Es lo que no se puede posponer.
    const byDate = (a: BriefTask, b: BriefTask): number => {
      const fechas = (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
      if (fechas !== 0) return fechas
      return (a.source === 'examen' ? 0 : 1) - (b.source === 'examen' ? 0 : 1)
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

  /** Frase de la notificacion. Lo urgente primero, y nada de relleno. */
  private headline(events: number, today: BriefTask[], overdue: number): string {
    // Los examenes se cuentan aparte: llamar "entrega" a un examen le quita
    // justo el peso que tiene que tener en una frase de una linea.
    const examenes = today.filter((t) => t.source === 'examen').length
    const entregas = today.length - examenes

    const partes: string[] = []
    if (examenes > 0) partes.push(`${plural(examenes, 'EXAMEN hoy', 'EXAMENES hoy')}`)
    if (overdue > 0) partes.push(`${plural(overdue, 'tarea atrasada', 'tareas atrasadas')}`)
    if (entregas > 0) partes.push(`${plural(entregas, 'entrega hoy', 'entregas hoy')}`)
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
