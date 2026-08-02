import type {
  AuthStatus,
  Assignment,
  CalendarEvent,
  ChatMessage,
  FileRule,
  ManualTask,
  MovePlan,
  Result,
  SafeSettings,
  Settings,
  UndoBatch
} from './types'

export interface ApplyOutcomeDto {
  moved: number
  failed: { file: string; error: string }[]
}

/**
 * Superficie que el proceso main expone al renderer.
 *
 * Es deliberadamente estrecha: el renderer no puede pedir "ejecuta esto", solo
 * puede llamar a estas operaciones concretas. Cualquier cosa que toque
 * credenciales o el disco se queda al otro lado.
 */
export interface JarvisApi {
  auth: {
    status(): Promise<Result<AuthStatus>>
    signIn(): Promise<Result<AuthStatus>>
    signOut(): Promise<Result<null>>
  }
  settings: {
    get(): Promise<Result<SafeSettings>>
    update(patch: Partial<Settings>): Promise<Result<SafeSettings>>
  }
  calendar: {
    list(timeMin: string, timeMax: string): Promise<Result<CalendarEvent[]>>
  }
  classroom: {
    list(force?: boolean): Promise<Result<Assignment[]>>
  }
  tasks: {
    list(): Promise<Result<ManualTask[]>>
    add(input: { title: string; subject?: string; dueDate?: string | null }): Promise<
      Result<ManualTask>
    >
    update(
      id: string,
      patch: Partial<Omit<ManualTask, 'id' | 'createdAt'>>
    ): Promise<Result<ManualTask>>
    remove(id: string): Promise<Result<null>>
  }
  agent: {
    send(text: string): Promise<Result<ChatMessage[]>>
    confirm(actionId: string, approved: boolean): Promise<Result<ChatMessage[]>>
    reset(): Promise<Result<null>>
    usage(): Promise<Result<{ callsToday: number }>>
    /** Modelos ya descargados en Ollama. Vacio si Ollama no responde. */
    ollamaModels(): Promise<Result<string[]>>
  }
  organizer: {
    listRules(): Promise<Result<FileRule[]>>
    saveRule(rule: Omit<FileRule, 'id'> & { id?: string }): Promise<Result<FileRule>>
    deleteRule(id: string): Promise<Result<null>>
    plan(): Promise<Result<MovePlan>>
    apply(planId: string): Promise<Result<ApplyOutcomeDto>>
    history(): Promise<Result<UndoBatch[]>>
    undoLast(): Promise<Result<ApplyOutcomeDto>>
  }
  dialog: {
    pickFolder(): Promise<Result<string | null>>
  }
  shell: {
    openExternal(url: string): Promise<Result<null>>
  }
}

/** Nombres de canal. Se usan en los dos lados, asi que viven aqui. */
export const Channels = {
  authStatus: 'auth:status',
  authSignIn: 'auth:signIn',
  authSignOut: 'auth:signOut',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  calendarList: 'calendar:list',
  classroomList: 'classroom:list',
  tasksList: 'tasks:list',
  tasksAdd: 'tasks:add',
  tasksUpdate: 'tasks:update',
  tasksRemove: 'tasks:remove',
  agentSend: 'agent:send',
  agentConfirm: 'agent:confirm',
  agentReset: 'agent:reset',
  agentUsage: 'agent:usage',
  agentOllamaModels: 'agent:ollamaModels',
  organizerListRules: 'organizer:listRules',
  organizerSaveRule: 'organizer:saveRule',
  organizerDeleteRule: 'organizer:deleteRule',
  organizerPlan: 'organizer:plan',
  organizerApply: 'organizer:apply',
  organizerHistory: 'organizer:history',
  organizerUndoLast: 'organizer:undoLast',
  dialogPickFolder: 'dialog:pickFolder',
  shellOpenExternal: 'shell:openExternal'
} as const
