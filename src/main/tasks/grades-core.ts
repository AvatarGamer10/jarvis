import type { Exam, Needed, SubjectSummary } from '@shared/types'

/**
 * Averages and weightings. Pure, with no dependency on the rest of the app.
 *
 * It lives apart from the service because the service drags in the on-disk
 * store, which does not compile outside Electron. And because this is the one
 * part of exams worth covering with tests: a badly calculated average does not
 * raise an error, it produces a wrong number, which is worse.
 */

/** The pass mark in the Spanish system. */
export const PASS_MARK = 5

/** Valid grades. Outside this range it is a typo, not a mark. */
export const GRADE_MIN = 0
export const GRADE_MAX = 10

const round = (n: number): number => Math.round(n * 100) / 100

export const isDone = (exam: Exam): boolean => exam.grade !== null

/**
 * The average of a set of exams.
 *
 * With weights it is weighted; without them it is a plain mean. If some carry
 * a weight and others do not, the plain mean is used: mixing the two would
 * mean inventing the missing weight and producing a number that looks exact
 * and is not.
 */
export function average(exams: Exam[]): { value: number | null; weighted: boolean } {
  const done = exams.filter(isDone)
  if (done.length === 0) return { value: null, weighted: false }

  const allWeighted = done.every((exam) => exam.weight !== null && exam.weight > 0)
  const totalWeight = done.reduce((sum, exam) => sum + (exam.weight ?? 0), 0)

  if (allWeighted && totalWeight > 0) {
    const points = done.reduce(
      (sum, exam) => sum + (exam.grade as number) * (exam.weight as number),
      0
    )
    return { value: round(points / totalWeight), weighted: true }
  }

  const sum = done.reduce((total, exam) => total + (exam.grade as number), 0)
  return { value: round(sum / done.length), weighted: false }
}

/**
 * What average the remaining exams have to reach to hit the target.
 *
 * Only meaningful if every exam in the subject carries a weight: without
 * knowing what the remainder is worth, there is no sum to do.
 *
 * The weights are not required to add up to 100. If somebody writes down
 * 30/30/30 the calculation is still correct against that total, and telling
 * them they are missing 10% would be scolding them for not having finished
 * writing it down.
 */
export function neededFor(exams: Exam[], target = PASS_MARK): Needed | null {
  const allWeighted = exams.every((exam) => exam.weight !== null && exam.weight > 0)
  if (!allWeighted || exams.length === 0) return null

  const pending = exams.filter((exam) => !isDone(exam))
  if (pending.length === 0) return null

  // With no grades at all yet the answer would always be "you need a 5", which
  // is the definition of passing. Saying it informs nobody.
  if (pending.length === exams.length) return null

  const totalWeight = exams.reduce((sum, exam) => sum + (exam.weight as number), 0)
  const pendingWeight = pending.reduce((sum, exam) => sum + (exam.weight as number), 0)
  if (pendingWeight <= 0) return null

  const earned = exams
    .filter(isDone)
    .reduce((sum, exam) => sum + (exam.grade as number) * (exam.weight as number), 0)

  // Points still missing, on the same scale as the weights.
  const missing = target * totalWeight - earned

  if (missing <= 0) return { state: 'safe' }

  const grade = missing / pendingWeight
  if (grade > GRADE_MAX) return { state: 'impossible' }

  return { state: 'needs', grade: round(grade) }
}

/**
 * One summary per subject, ordered by name.
 *
 * Subjects are grouped ignoring case and accents: somebody who writes "fisica"
 * one day and "Física" the next expects one subject, not two half-averages.
 * The name kept is whichever was typed first.
 */
export function bySubject(exams: Exam[], target = PASS_MARK): SubjectSummary[] {
  const groups = new Map<string, { name: string; exams: Exam[] }>()

  for (const exam of exams) {
    const name = exam.subject.trim() || 'No subject'
    const key = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')

    const group = groups.get(key)
    if (group) group.exams.push(exam)
    else groups.set(key, { name, exams: [exam] })
  }

  return [...groups.values()]
    .map(({ name, exams: inGroup }) => {
      const { value, weighted } = average(inGroup)
      return {
        subject: name,
        average: value,
        weighted,
        done: inGroup.filter(isDone).length,
        pending: inGroup.filter((exam) => !isDone(exam)).length,
        needed: neededFor(inGroup, target)
      }
    })
    .sort((a, b) => a.subject.localeCompare(b.subject))
}

/**
 * Exams that have not happened yet, nearest first.
 *
 * It looks at the calendar day, not the instant: an exam at nine in the
 * morning still counts as "today" for the whole of that day.
 */
export function upcoming(exams: Exam[], from = new Date()): Exam[] {
  const today = new Date(from)
  today.setHours(0, 0, 0, 0)

  return exams
    .filter((exam) => {
      const date = Date.parse(exam.date)
      return !Number.isNaN(date) && date >= today.getTime()
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
