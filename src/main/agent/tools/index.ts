import { calendarCreate, calendarList, calendarMove } from './calendar-tools'
import { classroomList } from './classroom-tools'
import type { Tool } from './types'

/**
 * Registro de herramientas. Anadir una capacidad nueva al agente es escribir un
 * fichero de herramienta y meterla en esta lista.
 */
export const TOOLS: Tool<never>[] = [
  calendarList,
  calendarCreate,
  calendarMove,
  classroomList
] as unknown as Tool<never>[]

export const toolByName = (name: string): Tool<never> | undefined =>
  TOOLS.find((tool) => tool.name === name)

export * from './types'
