import { calendarCreate, calendarList, calendarMove } from './calendar-tools'
import { classroomList } from './classroom-tools'
import { examsAdd, examsGrade, examsList } from './exams-tools'
import { filesApply, filesPlan, filesUndo } from './files-tools'
import { planificarEstudio } from './planner-tools'
import { tasksAdd, tasksComplete, tasksList } from './tasks-tools'
import type { Tool } from './types'

/**
 * The tool registry. Giving the agent a new capability means writing one tool
 * file and adding it to this list.
 */
export const TOOLS: Tool<never>[] = [
  calendarList,
  calendarCreate,
  calendarMove,
  classroomList,
  tasksList,
  tasksAdd,
  tasksComplete,
  examsList,
  examsAdd,
  examsGrade,
  planificarEstudio,
  filesPlan,
  filesApply,
  filesUndo
] as unknown as Tool<never>[]

export const toolByName = (name: string): Tool<never> | undefined =>
  TOOLS.find((tool) => tool.name === name)

export * from './types'
