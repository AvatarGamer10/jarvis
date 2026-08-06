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
  /** Arrancar JARVIS al iniciar sesion en el sistema. */
  startAtLogin: boolean
  /** Boton flotante siempre encima. */
  hudVisible: boolean
  /** Ultima posicion del boton flotante. null = aun sin colocar. */
  hudX: number | null
  hudY: number | null
  /** Fecha (YYYY-MM-DD) del ultimo resumen lanzado. Sirve para recuperar el
      aviso si la app no estaba abierta a su hora. */
  lastBriefDate: string | null
  /** Se pone a true al terminar la pantalla de bienvenida. */
  onboardingDone: boolean
  /** Sonidos de interfaz. Se sintetizan, no hay ficheros de audio. */
  soundEnabled: boolean
  /** Translucidez de la ventana. Se puede apagar si molesta al leer. */
  glassEnabled: boolean
  /** Carpetas dentro de las cuales el organizador tiene permiso para mover archivos. */
  managedRoots: string[]
}

/** Los ajustes tal como los ve el renderer: los secretos nunca viajan en claro. */
export type SafeSettings = Omit<Settings, 'googleClientSecret' | 'geminiApiKey'> & {
  hasGoogleClientSecret: boolean
  hasGeminiApiKey: boolean
  /** El usuario ha puesto su propio proyecto de Google Cloud. */
  usaCredencialesPropias: boolean
  /** Hay credenciales validas, propias o empaquetadas: se puede pulsar Conectar. */
  listoParaConectar: boolean
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

// --- Tareas propias --------------------------------------------------------

/**
 * Tarea que apunta el usuario a mano.
 *
 * Existe porque muchos centros bloquean el acceso de apps de terceros a
 * Classroom, y sin esto el modulo de tareas se quedaria vacio. Convive con las
 * de Classroom: cuando el colegio aprueba la app, se ven las dos cosas juntas.
 */
export interface ManualTask {
  id: string
  title: string
  /** Asignatura. Texto libre, no hay lista cerrada. */
  subject: string
  /** ISO 8601, o null si no tiene fecha. */
  dueDate: string | null
  done: boolean
  createdAt: string
}

/** Origen de una tarea en la vista unificada. */
export type TaskSource = 'classroom' | 'manual'

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

/**
 * Entrada del resumen, venga de donde venga.
 *
 * El resumen mezcla tareas de Classroom y tareas propias: a quien lo lee por la
 * manana le da igual de que fuente sale cada una, solo cuando vence.
 */
export interface BriefTask {
  title: string
  /** Asignatura, o nombre del curso si viene de Classroom. */
  subject: string
  dueDate: string | null
  source: TaskSource
  /** Enlace a Classroom, si aplica. */
  link?: string
}

export interface DailyBrief {
  /** Fecha del resumen en ISO. */
  date: string
  events: CalendarEvent[]
  dueToday: BriefTask[]
  dueSoon: BriefTask[]
  overdue: BriefTask[]
  /** Texto redactado por el modelo, o null si no habia ninguno disponible. */
  summary: string | null
  /** Frase corta para la notificacion del sistema. */
  headline: string
}

// --- Planificador de estudio -----------------------------------------------

export interface BloqueEstudio {
  /** ISO 8601. */
  inicio: string
  fin: string
  tarea: string
  asignatura: string
}

export interface PlanEstudio {
  /** Solo se puede aplicar por este id: el renderer no fabrica bloques. */
  id: string
  bloques: BloqueEstudio[]
}

// --- Ollama ----------------------------------------------------------------

export interface ModeloRecomendado {
  nombre: string
  etiqueta: string
  gigas: number
  descripcion: string
  memoriaMinimaGb: number
}

export interface ProgresoDescarga {
  modelo: string
  fase: string
  porcentaje: number
  descargado: number
  total: number
  terminado: boolean
  error?: string
}

// --- Actualizaciones -------------------------------------------------------

/**
 * Estado del actualizador, tal y como lo ve la interfaz.
 *
 * Es una union discriminada en vez de un objeto con campos opcionales: asi no
 * existe el estado imposible de "descargando pero sin version", y la interfaz
 * no tiene que comprobar nulos por todas partes.
 */
export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  /** Al dia. Se guarda la version para poder ensenarla en Ajustes. */
  | { phase: 'none'; currentVersion: string }
  | { phase: 'downloading'; version: string; percent: number; notes: string }
  | { phase: 'ready'; version: string; notes: string }
  | { phase: 'error'; message: string }

// --- Resultado generico para IPC ------------------------------------------

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
