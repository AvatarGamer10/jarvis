import { randomUUID } from 'node:crypto'
import type { ManualTask } from '@shared/types'
import { JsonStore } from '../store/json-store'

interface TasksData {
  tasks: ManualTask[]
}

/** Cuantas tareas ya hechas se conservan antes de ir descartando las mas viejas. */
const MAX_DONE = 100

/**
 * Tareas que el usuario apunta a mano.
 *
 * Es la fuente que siempre funciona: no depende de Google ni de que el
 * administrador del centro apruebe nada.
 */
export class ManualTaskService {
  private readonly store: JsonStore<TasksData>

  constructor() {
    this.store = new JsonStore<TasksData>('tasks.json', { tasks: [] })
  }

  list(): ManualTask[] {
    // Pendientes primero y, dentro de cada grupo, por fecha de entrega.
    // Las que no tienen fecha van al final: no son urgentes por definicion.
    return [...this.store.get().tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      if (a.dueDate === null && b.dueDate === null) return a.createdAt.localeCompare(b.createdAt)
      if (a.dueDate === null) return 1
      if (b.dueDate === null) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })
  }

  add(input: { title: string; subject?: string; dueDate?: string | null }): ManualTask {
    const title = input.title.trim()
    if (!title) throw new Error('La tarea necesita un titulo.')

    if (input.dueDate && Number.isNaN(Date.parse(input.dueDate))) {
      throw new Error(`"${input.dueDate}" no es una fecha valida.`)
    }

    const task: ManualTask = {
      id: randomUUID(),
      title,
      subject: input.subject?.trim() ?? '',
      dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : null,
      done: false,
      createdAt: new Date().toISOString()
    }

    this.store.set({ tasks: [...this.store.get().tasks, task] })
    return task
  }

  update(id: string, patch: Partial<Omit<ManualTask, 'id' | 'createdAt'>>): ManualTask {
    const tasks = [...this.store.get().tasks]
    const index = tasks.findIndex((t) => t.id === id)
    if (index === -1) throw new Error('Esa tarea ya no existe.')

    if (patch.dueDate && Number.isNaN(Date.parse(patch.dueDate))) {
      throw new Error(`"${patch.dueDate}" no es una fecha valida.`)
    }

    tasks[index] = {
      ...tasks[index],
      ...patch,
      ...(patch.dueDate !== undefined
        ? { dueDate: patch.dueDate ? new Date(patch.dueDate).toISOString() : null }
        : {})
    }

    this.store.set({ tasks: this.prune(tasks) })
    return tasks[index]
  }

  remove(id: string): void {
    this.store.set({ tasks: this.store.get().tasks.filter((t) => t.id !== id) })
  }

  /**
   * Busca una tarea pendiente por titulo aproximado.
   * El modelo dira "marca como hecha la de mates", no un uuid.
   */
  findByTitle(query: string): ManualTask | null {
    const needle = query.trim().toLowerCase()
    if (!needle) return null

    const pending = this.list().filter((t) => !t.done)
    return (
      pending.find((t) => t.title.toLowerCase() === needle) ??
      pending.find((t) => t.title.toLowerCase().includes(needle)) ??
      pending.find((t) => `${t.subject} ${t.title}`.toLowerCase().includes(needle)) ??
      null
    )
  }

  /** Evita que el fichero crezca sin fin con tareas viejas ya completadas. */
  private prune(tasks: ManualTask[]): ManualTask[] {
    const done = tasks.filter((t) => t.done)
    if (done.length <= MAX_DONE) return tasks

    const keep = new Set(
      [...done]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_DONE)
        .map((t) => t.id)
    )
    return tasks.filter((t) => !t.done || keep.has(t.id))
  }
}
