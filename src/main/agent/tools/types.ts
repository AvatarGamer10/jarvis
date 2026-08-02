import type { z } from 'zod'
import type { PendingAction } from '@shared/types'
import type { CalendarService } from '../../integrations/calendar'
import type { ClassroomService } from '../../integrations/classroom'
import type { OrganizerService } from '../../organizer'
import type { ManualTaskService } from '../../tasks/manual-tasks'
import type { FunctionDeclaration } from '../provider'

/** Lo que una herramienta puede tocar. Se le pasa al ejecutar, no lo guarda ella. */
export interface ToolContext {
  calendar: CalendarService
  classroom: ClassroomService
  organizer: OrganizerService
  tasks: ManualTaskService
}

export interface ToolResult {
  /** Frase corta para mostrar en el chat: "3 eventos encontrados". */
  summary: string
  /** Datos que se le devuelven al modelo. Deben ser pequenos: cuesta tokens. */
  data: unknown
}

export interface Tool<Args = unknown> {
  name: string
  /** Descripcion que lee el modelo para decidir si usarla. */
  description: string
  /** Esquema en formato OpenAPI que ve el modelo. */
  parameters: Record<string, unknown>
  /** Validacion real de los argumentos. El modelo se equivoca; esto no. */
  schema: z.ZodType<Args>
  /**
   * Si es true, la herramienta NO se ejecuta directamente: se devuelve una
   * PendingAction y hace falta que el usuario la confirme.
   */
  requiresConfirmation: boolean
  /** Texto de la tarjeta de confirmacion. Solo si requiresConfirmation. */
  describe?(args: Args): Pick<PendingAction, 'description' | 'details'>
  execute(args: Args, ctx: ToolContext): Promise<ToolResult>
}

export const declarationOf = (tool: Tool<never>): FunctionDeclaration => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters
})
