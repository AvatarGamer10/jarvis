/**
 * The contract between the main process and the renderer.
 * Both sides import from here, so changing anything tells you about it twice.
 */

// --- Authentication --------------------------------------------------------

export interface AuthStatus {
  connected: boolean
  email: string | null
  /** Why it is not connected, when that applies. */
  error?: string
}

// --- Settings --------------------------------------------------------------

/**
 * Which engine the assistant thinks with.
 *
 * `openrouter` exists because not everyone can host a model on their own
 * machine: a laptop with no room for eight gigabytes of weights is the normal
 * case, not the exception, and the local route cannot be the only one that
 * works.
 */
export type LlmProviderId =
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'mistral'
  | 'gemini'
  | 'ollama'
  /** Any server speaking the OpenAI dialect: LM Studio, vLLM, a proxy. */
  | 'custom'

export interface Settings {
  googleClientId: string
  googleClientSecret: string
  /** The active brain. Can be switched live, with no restart. */
  llmProvider: LlmProviderId
  geminiApiKey: string
  geminiModel: string
  /** One key in front of most of the models worth using. */
  openrouterApiKey: string
  openrouterModel: string
  openaiApiKey: string
  openaiModel: string
  anthropicApiKey: string
  anthropicModel: string
  groqApiKey: string
  groqModel: string
  mistralApiKey: string
  mistralModel: string
  /** Your own OpenAI-compatible server. The URL includes the /v1. */
  customBaseUrl: string
  customApiKey: string
  customModel: string
  /** Where the local Ollama server is listening. */
  ollamaHost: string
  ollamaModel: string
  /** Time of the morning brief, as HH:mm. */
  dailyBriefTime: string
  dailyBriefEnabled: boolean
  /** Start Vilo when you log in to the computer. */
  startAtLogin: boolean
  /** The always-on-top floating button. */
  hudVisible: boolean
  /** Last position of the floating button. null = never placed. */
  hudX: number | null
  hudY: number | null
  /** Date (YYYY-MM-DD) of the last brief that fired. Used to catch up if the
      app was not open at the time. */
  lastBriefDate: string | null
  /** Set to true once the welcome screen is finished. */
  onboardingDone: boolean
  /** The last version whose release notes the user has seen. */
  lastSeenVersion: string
  /** Interface sounds. Synthesised — there are no audio files. */
  soundEnabled: boolean
  /** Window translucency. Can be turned off if it makes reading harder. */
  glassEnabled: boolean
  /** Folders the organiser is allowed to move files within. */
  managedRoots: string[]
}

/** Settings as the renderer sees them: secrets never travel in the clear. */
export type SafeSettings = Omit<
  Settings,
  | 'googleClientSecret'
  | 'geminiApiKey'
  | 'openrouterApiKey'
  | 'openaiApiKey'
  | 'anthropicApiKey'
  | 'groqApiKey'
  | 'mistralApiKey'
  | 'customApiKey'
> & {
  hasGoogleClientSecret: boolean
  hasGeminiApiKey: boolean
  hasOpenrouterApiKey: boolean
  hasOpenaiApiKey: boolean
  hasAnthropicApiKey: boolean
  hasGroqApiKey: boolean
  hasMistralApiKey: boolean
  hasCustomApiKey: boolean
  /** The user has supplied their own Google Cloud project. */
  usesOwnCredentials: boolean
  /** Valid credentials exist, ours or theirs: Connect can be pressed. */
  canConnect: boolean
}

// --- Calendar --------------------------------------------------------------

export interface CalendarEvent {
  id: string
  title: string
  /** ISO 8601. For all-day events, the date only. */
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
  /** ISO 8601, or null if the assignment has no due date. */
  dueDate: string | null
  state: SubmissionState
  /** Link to the assignment on the Classroom site. */
  link: string
  /** Days until it is due. Negative once it has passed. */
  daysLeft: number | null
}

// --- The user's own tasks --------------------------------------------------

/**
 * A task the user writes down by hand.
 *
 * It exists because many schools block third-party access to Classroom, and
 * without it the tasks screen would simply be empty. It lives alongside the
 * Classroom ones: once a school approves the app, both are shown together.
 */
export interface ManualTask {
  id: string
  title: string
  /** Subject. Free text — there is no fixed list. */
  subject: string
  /** ISO 8601, or null if it has no date. */
  dueDate: string | null
  done: boolean
  createdAt: string
}

/** Where a task came from, in the combined view. */
export type TaskSource = 'classroom' | 'manual' | 'exam'

// --- Exams and grades ------------------------------------------------------

/**
 * An exam, before and after sitting it.
 *
 * It is the same record at both moments: first a date getting closer, then a
 * grade that counts towards the average. Splitting it into two types would
 * mean copying the subject and the title from one to the other.
 */
export interface Exam {
  id: string
  /** Subject. Free text, same as on tasks. */
  subject: string
  /** What it covers, or what the exam is called. */
  title: string
  /** ISO 8601. An exam with no date is not an exam. */
  date: string
  /** Grade from 0 to 10, or null until it has been given. */
  grade: number | null
  /** Weight within the term, as a percentage. null if unknown. */
  weight: number | null
  createdAt: string
}

/** What the remaining exams have to produce to reach the target. */
export type Needed =
  /** Already reached, even with a zero in everything that is left. */
  | { state: 'safe' }
  /** Not reachable, even with a ten in everything that is left. */
  | { state: 'impossible' }
  | { state: 'needs'; grade: number }

export interface SubjectSummary {
  subject: string
  /** Average out of 10, or null while there are no grades yet. */
  average: number | null
  /** True if the average uses the weights; false if it is a plain mean. */
  weighted: boolean
  done: number
  pending: number
  /**
   * Only calculated when every exam in the subject carries a weight and some
   * are still to come. Without weights any figure would be made up.
   */
  needed: Needed | null
}

// --- Folder organiser ------------------------------------------------------

export interface FileRule {
  id: string
  enabled: boolean
  name: string
  /** Source folder. Must be inside managedRoots. */
  source: string
  /** Destination folder. Must be inside managedRoots. */
  destination: string
  /** Extensions without the dot: ["pdf", "docx"]. Empty = all of them. */
  extensions: string[]
  /** Text that must appear in the file name. Empty = any name. */
  nameContains: string
}

export interface PlannedMove {
  from: string
  to: string
  /** Name of the rule that caused the move. */
  rule: string
  /** If a file already exists at the destination, the final suffixed name. */
  renamedTo?: string
}

export interface MovePlan {
  id: string
  moves: PlannedMove[]
  /** Files no rule claimed. */
  skipped: number
  createdAt: string
}

export interface UndoBatch {
  id: string
  appliedAt: string
  moves: PlannedMove[]
}

// --- The agent -------------------------------------------------------------

export type ChatRole = 'user' | 'assistant' | 'tool'

export interface ToolCallRecord {
  name: string
  args: Record<string, unknown>
  /** Readable summary of the result, for showing in the chat. */
  summary: string
  ok: boolean
}

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  at: string
  toolCalls?: ToolCallRecord[]
  /** An action waiting on the user's yes before it runs. */
  pendingAction?: PendingAction
}

/** Voice bundles Vilo can install independently of each other. */
export type ModelBundleId = 'stt-small' | 'stt-balanced' | 'tts-neural'

export type ModelInstallPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'cancelled'

/** A bundle's persistent state, worked out from the files on disk. */
export interface ModelBundleStatus {
  bundle: ModelBundleId
  installed: boolean
  /** Counts resumable parts, but never more than what is expected. */
  received: number
  total: number
}

/** Aggregate install progress, as the main process reports it. */
export interface ModelDownload {
  bundle: ModelBundleId
  phase: ModelInstallPhase
  /** The current file, without exposing the user's path. */
  file: string
  received: number
  total: number
  fileReceived: number
  fileTotal: number
}

/** An archived conversation, as it appears in the history list. */
export interface ChatSummary {
  id: string
  /** The first question asked, trimmed. */
  title: string
  /** ISO timestamp of the last message. */
  at: string
  messages: number
}

/** A file attached to a message, already read as text. */
export interface Attachment {
  name: string
  text: string
  /** Bytes of the original file, so it can be stated on screen. */
  bytes: number
}

/**
 * Tools that write something never run on their own: they return this, the
 * interface shows it, and it only runs if the user confirms.
 */
export interface PendingAction {
  id: string
  tool: string
  args: Record<string, unknown>
  /** Plain-English description of what is about to happen. */
  description: string
  /** Line-by-line detail — the list of file moves, for instance. */
  details: string[]
}

// --- The morning brief -----------------------------------------------------

/**
 * One line of the brief, wherever it came from.
 *
 * The brief mixes Classroom assignments and the user's own tasks: whoever
 * reads it in the morning does not care which is which, only when it is due.
 */
export interface BriefTask {
  title: string
  /** Subject, or the course name when it comes from Classroom. */
  subject: string
  dueDate: string | null
  source: TaskSource
  /** Link to Classroom, where there is one. */
  link?: string
}

export interface DailyBrief {
  /** Date of the brief, in ISO. */
  date: string
  events: CalendarEvent[]
  dueToday: BriefTask[]
  dueSoon: BriefTask[]
  overdue: BriefTask[]
  /** Prose written by the model, or null if none was available. */
  summary: string | null
  /** Short sentence for the system notification. */
  headline: string
}

// --- The study planner -----------------------------------------------------

export interface StudyBlock {
  /** ISO 8601. */
  start: string
  end: string
  task: string
  subject: string
}

export interface StudyPlan {
  /** Applied by id only: the renderer never builds blocks itself. */
  id: string
  blocks: StudyBlock[]
}

// --- Ollama ----------------------------------------------------------------

export interface RecommendedModel {
  name: string
  label: string
  gigabytes: number
  description: string
  minimumMemoryGb: number
}

export interface OllamaPullProgress {
  model: string
  phase: string
  percent: number
  downloaded: number
  total: number
  done: boolean
  error?: string
}

// --- Updates ---------------------------------------------------------------

/**
 * The updater's state, as the interface sees it.
 *
 * A discriminated union rather than an object of optional fields: that way the
 * impossible state of "downloading but with no version" cannot be written down,
 * and the interface never has to check for nulls.
 */
export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  /** Up to date. The version is kept so Settings can show it. */
  | { phase: 'none'; currentVersion: string }
  | { phase: 'downloading'; version: string; percent: number; notes: string }
  | { phase: 'ready'; version: string; notes: string }
  | { phase: 'error'; message: string }

// --- The generic IPC result ------------------------------------------------

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
