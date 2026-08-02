import type {
  AuthStatus,
  Assignment,
  CalendarEvent,
  ChatMessage,
  Result,
  SafeSettings,
  Settings
} from './types'

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
  agent: {
    send(text: string): Promise<Result<ChatMessage[]>>
    confirm(actionId: string, approved: boolean): Promise<Result<ChatMessage[]>>
    reset(): Promise<Result<null>>
    usage(): Promise<Result<{ callsToday: number }>>
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
  agentSend: 'agent:send',
  agentConfirm: 'agent:confirm',
  agentReset: 'agent:reset',
  agentUsage: 'agent:usage',
  shellOpenExternal: 'shell:openExternal'
} as const
