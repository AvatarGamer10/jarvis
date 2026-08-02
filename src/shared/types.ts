/**
 * Contrato entre el proceso main y el renderer.
 * Ambos lados importan de aqui, asi que si cambias algo, TypeScript te avisa en los dos.
 */

// --- Autenticacion ---------------------------------------------------------

export interface AuthStatus {
  connected: boolean
  email: string | null
  /** Motivo por el que no esta conectado, si aplica. */
  error?: string
}

// --- Ajustes ---------------------------------------------------------------

/** Que motor de IA usa el asistente. */
export type LlmProviderId = 'gemini' | 'ollama'

export interface Settings {
  googleClientId: string
  googleClientSecret: string
  /** Cerebro activo. Se puede cambiar en caliente, sin reiniciar. */
  llmProvider: LlmProviderId
  geminiApiKey: string
  geminiModel: string
  /** Direccion del servidor local de Ollama. */
  ollamaHost: string
  ollamaModel: string
  /** Hora del resumen diario en formato HH:mm. */
  dailyBriefTime: string
  dailyBriefEnabled: boolean
  /** Carpetas dentro de las cuales el organizador tiene permiso para mover archivos. */
  managedRoots: string[]
}

/** Los ajustes tal como los ve el renderer: los secretos nunca viajan en claro. */
export type SafeSettings = Omit<Settings, 'googleClientSecret' | 'geminiApiKey'> & {
  hasGoogleClientSecret: boolean
  hasGeminiApiKey: boolean
}

// --- Calendario ------------------------------------------------------------

export interface CalendarEvent {
  id: string
  title: string
  /** ISO 8601. Para eventos de dia completo, solo la fecha. */
  start: string
  end: string
  allDay: boolean
  location?: string
  htmlLink?: string
}

// --- Classroom -------------------------------------------------------------

export type SubmissionState =
  | 'PENDIENTE'
  | 'ENTREGADA'
  | 'DEVUELTA'
  | 'ATRASADA'
  | 'DESCONOCIDA'

export interface Assignment {
  id: string
  courseId: string
  courseName: string
  title: string
  description?: string
  /** ISO 8601, o null si la tarea no tiene fecha de entrega. */
  dueDate: string | null
  state: SubmissionState
  /** Enlace a la tarea en la web de Classroom. */
  link: string
  /** Dias que faltan para la entrega. Negativo si ya paso. */
  daysLeft: number | null
}

// --- Organizador de carpetas ----------------------------------------------

export interface FileRule {
  id: string
  enabled: boolean
  name: string
  /** Carpeta de origen. Debe estar dentro de managedRoots. */
  source: string
  /** Carpeta de destino. Debe estar dentro de managedRoots. */
  destination: string
  /** Extensiones sin punto: ["pdf", "docx"]. Vacio = todas. */
  extensions: string[]
  /** Texto que debe aparecer en el nombre del archivo. Vacio = cualquiera. */
  nameContains: string
}

export interface PlannedMove {
  from: string
  to: string
  /** Nombre de la regla que ha provocado el movimiento. */
  rule: string
  /** Si ya existe un archivo en el destino, aqui va el nombre final con sufijo. */
  renamedTo?: string
}

export interface MovePlan {
  id: string
  moves: PlannedMove[]
  /** Archivos que ninguna regla ha reclamado. */
  skipped: number
  createdAt: string
}

export interface UndoBatch {
  id: string
  appliedAt: string
  moves: PlannedMove[]
}

// --- Agente ----------------------------------------------------------------

export type ChatRole = 'user' | 'assistant' | 'tool'

export interface ToolCallRecord {
  name: string
  args: Record<string, unknown>
  /** Resumen legible del resultado, para mostrarlo en el chat. */
  summary: string
  ok: boolean
}

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  at: string
  toolCalls?: ToolCallRecord[]
  /** Accion que espera confirmacion del usuario antes de ejecutarse. */
  pendingAction?: PendingAction
}

/**
 * Las herramientas que escriben algo nunca se ejecutan solas: devuelven esto,
 * la interfaz lo muestra, y solo se ejecuta si el usuario lo confirma.
 */
export interface PendingAction {
  id: string
  tool: string
  args: Record<string, unknown>
  /** Descripcion en cristiano de lo que va a pasar. */
  description: string
  /** Detalle linea a linea (por ejemplo, la lista de movimientos de archivos). */
  details: string[]
}

// --- Resumen diario --------------------------------------------------------

export interface DailyBrief {
  date: string
  events: CalendarEvent[]
  dueToday: Assignment[]
  dueSoon: Assignment[]
  overdue: Assignment[]
  /** Texto redactado por el modelo, o null si Gemini no estaba disponible. */
  summary: string | null
}

// --- Resultado generico para IPC ------------------------------------------

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
