import { randomUUID } from 'node:crypto'
import type { Examen } from '@shared/types'
import { JsonStore } from '../store/json-store'
import { NOTA_MAX, NOTA_MIN } from './notas-core'

interface ExamenesData {
  examenes: Examen[]
}

/**
 * Examenes y notas.
 *
 * Separado de las tareas a proposito: una tarea se entrega y desaparece, un
 * examen se queda para siempre porque cuenta para la media. Mezclarlos en el
 * mismo almacen obligaria a que "hecha" significara dos cosas distintas.
 */
export class ExamenService {
  private readonly store: JsonStore<ExamenesData>

  constructor() {
    this.store = new JsonStore<ExamenesData>('examenes.json', { examenes: [] })
  }

  /** Del mas cercano al mas lejano; los ya pasados quedan al final. */
  list(): Examen[] {
    return [...this.store.get().examenes].sort((a, b) => a.date.localeCompare(b.date))
  }

  add(input: {
    title: string
    subject?: string
    date: string
    weight?: number | null
    grade?: number | null
  }): Examen {
    const title = input.title.trim()
    if (!title) throw new Error('El examen necesita un titulo.')
    if (!input.date || Number.isNaN(Date.parse(input.date))) {
      throw new Error('El examen necesita una fecha valida.')
    }

    const examen: Examen = {
      id: randomUUID(),
      title,
      subject: input.subject?.trim() ?? '',
      date: new Date(input.date).toISOString(),
      grade: comprobarNota(input.grade ?? null),
      weight: comprobarPeso(input.weight ?? null),
      createdAt: new Date().toISOString()
    }

    this.store.set({ examenes: [...this.store.get().examenes, examen] })
    return examen
  }

  update(id: string, patch: Partial<Omit<Examen, 'id' | 'createdAt'>>): Examen {
    const examenes = [...this.store.get().examenes]
    const indice = examenes.findIndex((e) => e.id === id)
    if (indice === -1) throw new Error('Ese examen ya no existe.')

    if (patch.date !== undefined && Number.isNaN(Date.parse(patch.date))) {
      throw new Error(`"${patch.date}" no es una fecha valida.`)
    }

    examenes[indice] = {
      ...examenes[indice],
      ...patch,
      ...(patch.date !== undefined ? { date: new Date(patch.date).toISOString() } : {}),
      ...(patch.grade !== undefined ? { grade: comprobarNota(patch.grade) } : {}),
      ...(patch.weight !== undefined ? { weight: comprobarPeso(patch.weight) } : {})
    }

    this.store.set({ examenes })
    return examenes[indice]
  }

  remove(id: string): void {
    this.store.set({ examenes: this.store.get().examenes.filter((e) => e.id !== id) })
  }

  /**
   * Busca por titulo o asignatura aproximados.
   * El modelo dira "ponme un 7 en el de mates", no un uuid.
   */
  findByText(query: string): Examen | null {
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
 * Las notas y los pesos vienen del usuario o del modelo, y los dos se
 * equivocan. Guardar un 70 donde iba un 7 estropearia la media en silencio.
 */
function comprobarNota(nota: number | null): number | null {
  if (nota === null) return null
  if (typeof nota !== 'number' || Number.isNaN(nota)) throw new Error('La nota no es un numero.')
  if (nota < NOTA_MIN || nota > NOTA_MAX) {
    throw new Error(`La nota debe estar entre ${NOTA_MIN} y ${NOTA_MAX}.`)
  }
  return nota
}

function comprobarPeso(peso: number | null): number | null {
  if (peso === null) return null
  if (typeof peso !== 'number' || Number.isNaN(peso)) throw new Error('El peso no es un numero.')
  if (peso <= 0 || peso > 100) throw new Error('El peso debe estar entre 1 y 100.')
  return peso
}
