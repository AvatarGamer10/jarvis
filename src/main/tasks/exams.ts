import { randomUUID } from 'node:crypto'
import type { Exam } from '@shared/types'
import { JsonStore } from '../store/json-store'
import { GRADE_MAX, GRADE_MIN } from './grades-core'

interface ExamenesData {
  exams: Exam[]
}

/**
 * Examenes y notas.
 *
 * Kept apart from tasks on purpose: a task is handed in and disappears, while
 * an exam stays forever because it counts towards the average. Putting them in
 * one store would force "done" to mean two different things.
 */
export class ExamenService {
  private readonly store: JsonStore<ExamenesData>

  constructor() {
    this.store = new JsonStore<ExamenesData>('exams.json', { exams: [] })
  }

  /** Nearest first; the ones that have passed go to the end. */
  list(): Exam[] {
    return [...this.store.get().exams].sort((a, b) => a.date.localeCompare(b.date))
  }

  add(input: {
    title: string
    subject?: string
    date: string
    weight?: number | null
    grade?: number | null
  }): Exam {
    const title = input.title.trim()
    if (!title) throw new Error('An exam needs a title.')
    if (!input.date || Number.isNaN(Date.parse(input.date))) {
      throw new Error('An exam needs a valid date.')
    }

    const exam: Exam = {
      id: randomUUID(),
      title,
      subject: input.subject?.trim() ?? '',
      date: new Date(input.date).toISOString(),
      grade: comprobarNota(input.grade ?? null),
      weight: comprobarPeso(input.weight ?? null),
      createdAt: new Date().toISOString()
    }

    this.store.set({ exams: [...this.store.get().exams, exam] })
    return exam
  }

  update(id: string, patch: Partial<Omit<Exam, 'id' | 'createdAt'>>): Exam {
    const exams = [...this.store.get().exams]
    const index = exams.findIndex((e) => e.id === id)
    if (index === -1) throw new Error('That exam no longer exists.')

    if (patch.date !== undefined && Number.isNaN(Date.parse(patch.date))) {
      throw new Error(`"${patch.date}" is not a valid date.`)
    }

    exams[index] = {
      ...exams[index],
      ...patch,
      ...(patch.date !== undefined ? { date: new Date(patch.date).toISOString() } : {}),
      ...(patch.grade !== undefined ? { grade: comprobarNota(patch.grade) } : {}),
      ...(patch.weight !== undefined ? { weight: comprobarPeso(patch.weight) } : {})
    }

    this.store.set({ exams })
    return exams[index]
  }

  remove(id: string): void {
    this.store.set({ exams: this.store.get().exams.filter((e) => e.id !== id) })
  }

  /**
   * Finds one by approximate title or subject.
   * The model will say "give me a 7 on the maths one", not quote a uuid.
   */
  findByText(query: string): Exam | null {
    const aguja = query.trim().toLowerCase()
    if (!aguja) return null

    const todos = this.list()
    return (
      todos.find((e) => e.title.toLowerCase() === aguja) ??
      todos.find((e) => e.title.toLowerCase().includes(aguja)) ??
      todos.find((e) => `${e.subject} ${e.title}`.toLowerCase().includes(aguja)) ??
      null
    )
  }
}

/**
 * Grades and weights come from the user or the model, and both of them
 * get it wrong. Storing a 70 where a 7 was meant would quietly ruin the
 * average.
 */
function comprobarNota(grade: number | null): number | null {
  if (grade === null) return null
  if (typeof grade !== 'number' || Number.isNaN(grade)) throw new Error('That grade is not a number.')
  if (grade < GRADE_MIN || grade > GRADE_MAX) {
    throw new Error(`A grade has to be between ${GRADE_MIN} and ${GRADE_MAX}.`)
  }
  return grade
}

function comprobarPeso(weight: number | null): number | null {
  if (weight === null) return null
  if (typeof weight !== 'number' || Number.isNaN(weight)) throw new Error('That weight is not a number.')
  if (weight <= 0 || weight > 100) throw new Error('A weight has to be between 1 and 100.')
  return weight
}
