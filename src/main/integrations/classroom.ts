import type { Assignment, SubmissionState } from '@shared/types'
import type { GoogleApi } from './google-api'

const BASE = 'https://classroom.googleapis.com/v1'

interface Course {
  id: string
  name: string
  section?: string
  courseState: string
}

interface DueDate {
  year: number
  month: number
  day: number
}

interface DueTime {
  hours?: number
  minutes?: number
}

interface CourseWork {
  id: string
  title: string
  description?: string
  alternateLink: string
  workType?: string
  dueDate?: DueDate
  dueTime?: DueTime
}

interface StudentSubmission {
  id: string
  courseWorkId: string
  state?: 'NEW' | 'CREATED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED_BY_STUDENT'
  late?: boolean
}

/**
 * Google dueDate la fecha de vencimiento troceada y SIEMPRE en UTC.
 * Joining them while ignoring that makes work due at 23:59 show up a day late
 * for anybody in Spain.
 */
function toDueIso(dueDate?: DueDate, dueTime?: DueTime): string | null {
  if (!dueDate) return null
  return new Date(
    Date.UTC(
      dueDate.year,
      dueDate.month - 1,
      dueDate.day,
      dueTime?.hours ?? 23,
      dueTime?.minutes ?? 59
    )
  ).toISOString()
}

function toState(submission: StudentSubmission | undefined, dueIso: string | null): SubmissionState {
  if (!submission) return 'DESCONOCIDA'

  switch (submission.state) {
    case 'TURNED_IN':
      return 'ENTREGADA'
    case 'RETURNED':
      return 'DEVUELTA'
    case 'NEW':
    case 'CREATED':
    case 'RECLAIMED_BY_STUDENT': {
      if (submission.late) return 'ATRASADA'
      if (dueIso && new Date(dueIso).getTime() < Date.now()) return 'ATRASADA'
      return 'PENDIENTE'
    }
    default:
      return 'DESCONOCIDA'
  }
}

function daysUntil(dueIso: string | null): number | null {
  if (!dueIso) return null
  const msPerDay = 24 * 60 * 60 * 1000
  // Calendar days are compared, not 24-hour windows: "tomorrow at 08:00" has
  // decir 1 dia, no 0, aunque falten menos de 24 horas.
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const due = new Date(dueIso)
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - startOfToday.getTime()) / msPerDay)
}

export class ClassroomService {
  private cache: { at: number; data: Assignment[] } | null = null
  private static readonly CACHE_MS = 5 * 60 * 1000

  constructor(private readonly api: GoogleApi) {}

  async listCourses(): Promise<Course[]> {
    const url = new URL(`${BASE}/courses`)
    url.searchParams.set('studentId', 'me')
    url.searchParams.set('courseStates', 'ACTIVE')
    url.searchParams.set('pageSize', '50')
    return this.api.listAll<Course>(url.toString(), 'courses')
  }

  /**
   * All of the student's assignments, ordered by urgency.
   *
   * It is one request per course, so it is cached for five minutes: the
   * Classroom free tier is not infinite either, and assignments do not change
   * by the second.
   */
  async listAssignments(force = false): Promise<Assignment[]> {
    if (!force && this.cache && Date.now() - this.cache.at < ClassroomService.CACHE_MS) {
      return this.cache.data
    }

    const courses = await this.listCourses()

    const perCourse = await Promise.all(
      courses.map(async (course) => {
        try {
          return await this.assignmentsForCourse(course)
        } catch (err) {
          // A course that fails — a half-archived one, say — must not
          // tumbar la list entera.
          console.error(`[classroom] failed reading the course "${course.name}":`, err)
          return []
        }
      })
    )

    const all = perCourse.flat().sort((a, b) => {
      if (a.dueDate === null) return 1
      if (b.dueDate === null) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })

    this.cache = { at: Date.now(), data: all }
    return all
  }

  private async assignmentsForCourse(course: Course): Promise<Assignment[]> {
    const workUrl = new URL(`${BASE}/courses/${course.id}/courseWork`)
    workUrl.searchParams.set('pageSize', '50')
    const work = await this.api.listAll<CourseWork>(workUrl.toString(), 'courseWork')
    if (work.length === 0) return []

    // One submissions listing for the whole course: asking assignment by
    // assignment would multiply the requests for nothing.
    const subsUrl = new URL(`${BASE}/courses/${course.id}/courseWork/-/studentSubmissions`)
    subsUrl.searchParams.set('userId', 'me')
    subsUrl.searchParams.set('pageSize', '200')
    const submissions = await this.api.listAll<StudentSubmission>(
      subsUrl.toString(),
      'studentSubmissions'
    )
    const byWorkId = new Map(submissions.map((s) => [s.courseWorkId, s]))

    return work.map((w) => {
      const dueDate = toDueIso(w.dueDate, w.dueTime)
      return {
        id: w.id,
        courseId: course.id,
        courseName: course.name,
        title: w.title,
        description: w.description,
        dueDate,
        state: toState(byWorkId.get(w.id), dueDate),
        link: w.alternateLink,
        daysLeft: daysUntil(dueDate)
      }
    })
  }

  /** Only what is still unsubmitted. That is what matters 90% of the time. */
  async listPending(force = false): Promise<Assignment[]> {
    const all = await this.listAssignments(force)
    return all.filter((a) => a.state === 'PENDIENTE' || a.state === 'ATRASADA')
  }

  invalidateCache(): void {
    this.cache = null
  }
}
