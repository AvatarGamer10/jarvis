import { randomUUID } from 'node:crypto'
import type { PlanEstudio } from '@shared/types'
import { calcular, type Bloque, type FuentesPlanificador } from './planificador-core'

/**
 * Planificador accesible desde la interfaz, sin pasar por el chat.
 *
 * La herramienta del agente solo sirve si Ollama esta funcionando y si el
 * modelo acierta a elegirla. Esto es lo mismo con un boton: funciona siempre,
 * incluso sin modelo.
 *
 * Los planes calculados se guardan aqui y solo se pueden aplicar por su id,
 * igual que en el organizador de carpetas: asi el renderer no puede fabricar
 * una lista de eventos y pedir que se creen.
 */
export class PlannerService {
  private readonly planes = new Map<string, Bloque[]>()

  constructor(private readonly fuentes: () => FuentesPlanificador) {}

  async calcular(dias: number): Promise<PlanEstudio> {
    const bloques = await calcular(dias, this.fuentes())
    const id = randomUUID()
    this.planes.set(id, bloques)

    // No se dejan crecer sin control en una sesion larga.
    if (this.planes.size > 10) {
      const antiguo = [...this.planes.keys()][0]
      this.planes.delete(antiguo)
    }

    return {
      id,
      bloques: bloques.map((b) => ({
        inicio: b.inicio.toISOString(),
        fin: b.fin.toISOString(),
        tarea: b.tarea,
        asignatura: b.asignatura
      }))
    }
  }

  async aplicar(
    planId: string,
    crear: (bloque: Bloque) => Promise<void>
  ): Promise<{ creados: number; fallos: string[] }> {
    const bloques = this.planes.get(planId)
    if (!bloques) {
      throw new Error('Ese plan ya no existe. Vuelve a calcularlo.')
    }
    this.planes.delete(planId)

    let creados = 0
    const fallos: string[] = []

    for (const b of bloques) {
      try {
        await crear(b)
        creados++
      } catch (err) {
        // Un evento que falla no debe tumbar el resto del plan.
        fallos.push((err as Error).message)
      }
    }

    return { creados, fallos }
  }
}
