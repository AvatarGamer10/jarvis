import type { z } from 'zod'
import type { PendingAction } from '@shared/types'
import type { CalendarService } from '../../integrations/calendar'
import type { ClassroomService } from '../../integrations/classroom'
import type { OrganizerService } from '../../organizer'
import type { ExamenService } from '../../tasks/exams'
import type { ManualTaskService } from '../../tasks/manual-tasks'
import type { FunctionDeclaration } from '../provider'

/** What a tool is allowed to touch. Passed in on execution, never held. */
export interface ToolContext {
  calendar: CalendarService
  classroom: ClassroomService
  organizer: OrganizerService
  tasks: ManualTaskService
  exams: ExamenService
}

export interface ToolResult {
  /** Short line for the chat: "3 events found". */
  summary: string
  /** Data handed back to the model. Keep it small: it costs tokens. */
  data: unknown
}

export interface Tool<Args = unknown> {
  name: string
  /** The description the model reads to decide whether to use it. */
  description: string
  /** The OpenAPI-shaped schema the model sees. */
  parameters: Record<string, unknown>
  /** Real validation of the arguments. The model gets these wrong; this does not. */
  schema: z.ZodType<Args>
  /**
   * When true the tool does NOT run directly: a PendingAction is returned and
   * the user has to confirm it.
   */
  requiresConfirmation: boolean
  /**
   * Paso previo opcional, antes de describir o ejecutar.
   *
   * For tools that have to work something out before they can explain what is
   * about to happen. The planner, for instance, has to look at the calendar and
   * the tasks to list the blocks it proposes: without this the confirmation
   * card would say "I am going to plan" without saying what.
   *
   * Whatever it returns replaces the arguments in `describe` and `execute`.
   */
  prepare?(args: Args, ctx: ToolContext): Promise<Args>
  /** Texto de la tarjeta de confirmacion. Solo si requiresConfirmation. */
  describe?(args: Args): Pick<PendingAction, 'description' | 'details'>
  execute(args: Args, ctx: ToolContext): Promise<ToolResult>
}

export const declarationOf = (tool: Tool<never>): FunctionDeclaration => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters
})
