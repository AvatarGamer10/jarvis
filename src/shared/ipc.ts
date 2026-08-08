import type {
  Assignment,
  Attachment,
  AuthStatus,
  CalendarEvent,
  ChatMessage,
  ChatSummary,
  DailyBrief,
  Exam,
  FileRule,
  LlmProviderId,
  ManualTask,
  ModelBundleId,
  ModelBundleStatus,
  SubjectSummary,
  ModelDownload,
  MovePlan,
  Result,
  SafeSettings,
  RecommendedModel,
  StudyPlan,
  OllamaPullProgress,
  Settings,
  UndoBatch,
  UpdateState
} from './types'

export interface ApplyOutcomeDto {
  moved: number
  failed: { file: string; error: string }[]
}

/**
 * The surface the main process exposes to the renderer.
 *
 * Deliberately narrow: the renderer cannot ask it to "run this", only
 * can call these specific operations. Anything touching credentials or the
 * disk stays on the other side.
 */
export interface ViloApi {
  auth: {
    status(): Promise<Result<AuthStatus>>
    signIn(): Promise<Result<AuthStatus>>
    signOut(): Promise<Result<null>>
  }
  app: {
    /** The app version, for the foot of Settings. */
    version(): Promise<Result<string>>
    /** Asks the system for the microphone once and reports its real state. */
    microphone(): Promise<
      Result<{
        granted: boolean
        status: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
      }>
    >
  }
  models: {
    /** Bytes taken by the downloaded models (voice and recognition). */
    size(): Promise<Result<number>>
    /** Deletes them all. They download again next time they are needed. */
    clear(): Promise<Result<null>>
    /** Checks an installation without touching the network. */
    status(bundle: ModelBundleId): Promise<Result<ModelBundleStatus>>
    /** Installs or resumes a bundle, verifying every file before use. */
    install(bundle: ModelBundleId): Promise<Result<ModelBundleStatus>>
    /** Deletes just that bundle and installs it again from scratch. */
    repair(bundle: ModelBundleId): Promise<Result<ModelBundleStatus>>
    /** Stops the current request. What is already written is kept to resume. */
    cancel(bundle: ModelBundleId): Promise<Result<null>>
    /** Download progress, emitted from the main process. */
    onProgress(callback: (progress: ModelDownload) => void): () => void
  }
  settings: {
    get(): Promise<Result<SafeSettings>>
    update(patch: Partial<Settings>): Promise<Result<SafeSettings>>
    /** Factory settings, and every stored credential deleted. */
    reset(): Promise<Result<SafeSettings>>
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
    /**
     * Turns text pasted out of Classroom into proposed tasks.
     * Creates nothing: the renderer shows them and they are only saved on a yes.
     */
    parsePasted(text: string): Promise<
      Result<{
        tasks: { title: string; subject: string; dueDate: string | null }[]
        source: 'model' | 'text'
      }>
    >
  }
  exams: {
    /** The exams, and the per-subject averages already worked out. */
    list(): Promise<Result<{ exams: Exam[]; summary: SubjectSummary[] }>>
    add(input: {
      title: string
      subject?: string
      date: string
      weight?: number | null
      grade?: number | null
    }): Promise<Result<Exam>>
    update(
      id: string,
      patch: Partial<Omit<Exam, 'id' | 'createdAt'>>
    ): Promise<Result<Exam>>
    remove(id: string): Promise<Result<null>>
  }
  ollama: {
    /** True if Ollama answers. Polled in a loop while it installs. */
    isRunning(): Promise<Result<boolean>>
    recommended(): Promise<Result<RecommendedModel[]>>
    /** Starts the download; progress arrives through onProgress. */
    pull(model: string): Promise<Result<null>>
    cancelPull(): Promise<Result<null>>
    onProgress(callback: (progress: OllamaPullProgress) => void): () => void
    /**
     * Sends a real request with tools, to check the model answers and knows how
     * to use them. Detecting that it exists is not enough.
     */
    test(): Promise<Result<{ ok: boolean; detail: string }>>
  }
  agent: {
    /** The saved conversation, for painting when the chat opens. */
    history(): Promise<Result<ChatMessage[]>>
    send(text: string): Promise<Result<ChatMessage[]>>
    confirm(actionId: string, approved: boolean): Promise<Result<ChatMessage[]>>
    reset(): Promise<Result<null>>
    /** Earlier conversations, most recent first. */
    conversations(): Promise<Result<ChatSummary[]>>
    /** Files the current one away and starts a clean one. */
    newConversation(): Promise<Result<null>>
    /** Goes back to an earlier one, filing the current one away first. */
    openConversation(id: string): Promise<Result<ChatMessage[]>>
    deleteConversation(id: string): Promise<Result<null>>
    usage(): Promise<Result<{ callsToday: number }>>
    /** Models already pulled in Ollama. Empty if Ollama does not answer. */
    ollamaModels(): Promise<Result<string[]>>
    /**
     * Models an OpenAI-compatible provider offers. Empty if the key is bad or
     * there is no connection; the id can always be typed by hand. On OpenRouter
     * it is filtered to the ones that support tools.
     */
    models(provider: LlmProviderId): Promise<Result<{ id: string; name: string; free: boolean }[]>>
    /**
     * A real request against the active provider. It is the only thing that
     * proves the key, the model, the network and the credit all line up.
     */
    check(): Promise<Result<{ ok: boolean; detail: string }>>
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
  brief: {
    /** `withSummary` false skips the model call, which is the slow part. */
    get(withSummary?: boolean): Promise<Result<DailyBrief>>
    /** Just the numbers, for the floating orb. */
    counts(): Promise<Result<{ today: number; overdue: number }>>
  }
  plan: {
    /** Works out the distribution without touching the calendar. */
    planBlocks(dias?: number): Promise<Result<StudyPlan>>
    /** Creates the events for a plan that has already been worked out. */
    aplicar(planId: string): Promise<Result<{ creados: number; fallos: string[] }>>
  }
  whatsNew: {
    /** What to show after an update. Empty if there is nothing new to say. */
    pending(): Promise<Result<{ version: string; title: string; points: string[] }[]>>
    /** Marks the current version as seen so it does not appear again. */
    markSeen(): Promise<Result<null>>
  }
  updater: {
    /** Current state, so something can be painted before any event arrives. */
    get(): Promise<Result<UpdateState>>
    check(): Promise<Result<null>>
    installAndRestart(): Promise<Result<null>>
    /** Subscribes to changes. Returns the function that unsubscribes. */
    onState(callback: (state: UpdateState) => void): () => void
  }
  hud: {
    toggle(): Promise<Result<boolean>>
    close(): Promise<Result<null>>
    /** Movement in pixels; called while dragging. */
    move(dx: number, dy: number): Promise<Result<null>>
    /** Grows to show an answer, or shrinks back again. */
    expand(open: boolean): Promise<Result<null>>
    /** Opens the main window on a particular section. */
    openApp(): Promise<Result<null>>
  }
  data: {
    /** Saves tasks, rules and the conversation to a file. null if cancelled. */
    exportData(): Promise<Result<{ path: string; files: number } | null>>
    /** Restores from a backup. Needs a restart afterwards. */
    importData(): Promise<Result<{ files: number } | null>>
  }
  dialog: {
    /** Opens a text file and returns it read, for attaching to the chat. */
    attachFile(): Promise<Result<Attachment | null>>
    pickFolder(): Promise<Result<string | null>>
    /**
     * Opens the client_secret_*.json downloaded from Google Cloud and saves the
     * credentials. Read and extracted in the main process: the secret never
     * llega a cruzar al renderer en ningun momento.
     */
    importGoogleJson(): Promise<Result<SafeSettings | null>>
  }
  shell: {
    openExternal(url: string): Promise<Result<null>>
  }
}

/** Channel names. Used on both sides, so they live here. */
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
  tasksParsePasted: 'tasks:parsePasted',
  examsList: 'exams:list',
  examsAdd: 'exams:add',
  examsUpdate: 'exams:update',
  examsRemove: 'exams:remove',
  agentHistory: 'agent:history',
  agentSend: 'agent:send',
  agentConfirm: 'agent:confirm',
  agentReset: 'agent:reset',
  agentUsage: 'agent:usage',
  appVersion: 'app:version',
  appMicrophone: 'app:microphone',
  modelsSize: 'models:size',
  modelsClear: 'models:clear',
  modelsStatus: 'models:status',
  modelsInstall: 'models:install',
  modelsRepair: 'models:repair',
  modelsCancel: 'models:cancel',
  modelProgress: 'models:progress',
  settingsReset: 'settings:reset',
  agentOllamaModels: 'agent:ollamaModels',
  agentConversations: 'agent:conversations',
  agentNewConversation: 'agent:newConversation',
  agentOpenConversation: 'agent:openConversation',
  agentDeleteConversation: 'agent:deleteConversation',
  agentModels: 'agent:models',
  agentCheck: 'agent:check',
  ollamaIsRunning: 'ollama:isRunning',
  ollamaRecommended: 'ollama:recommended',
  ollamaPull: 'ollama:pull',
  ollamaCancelPull: 'ollama:cancelPull',
  /** Pushed from main to the renderer. */
  ollamaProgress: 'ollama:progress',
  ollamaTest: 'ollama:test',
  organizerListRules: 'organizer:listRules',
  organizerSaveRule: 'organizer:saveRule',
  organizerDeleteRule: 'organizer:deleteRule',
  organizerPlan: 'organizer:plan',
  organizerApply: 'organizer:apply',
  organizerHistory: 'organizer:history',
  organizerUndoLast: 'organizer:undoLast',
  briefGet: 'brief:get',
  briefCounts: 'brief:counts',
  planCalcular: 'plan:planBlocks',
  planAplicar: 'plan:aplicar',
  whatsNewPending: 'whatsNew:pending',
  whatsNewMarkSeen: 'whatsNew:markSeen',
  updaterGet: 'updater:get',
  updaterCheck: 'updater:check',
  updaterInstall: 'updater:install',
  /** Pushed from main to the renderer, the opposite way to everything else. */
  updaterState: 'updater:state',
  hudToggle: 'hud:toggle',
  hudClose: 'hud:close',
  hudMove: 'hud:move',
  hudExpand: 'hud:expand',
  hudOpenApp: 'hud:openApp',
  dataExport: 'data:export',
  dataImport: 'data:import',
  dialogPickFolder: 'dialog:pickFolder',
  dialogImportGoogleJson: 'dialog:importGoogleJson',
  dialogAttachFile: 'dialog:attachFile',
  shellOpenExternal: 'shell:openExternal'
} as const
