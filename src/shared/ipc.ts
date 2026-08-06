import type {
  AuthStatus,
  Assignment,
  CalendarEvent,
  ChatMessage,
  DailyBrief,
  FileRule,
  ManualTask,
  MovePlan,
  Result,
  SafeSettings,
  ModeloRecomendado,
  PlanEstudio,
  ProgresoDescarga,
  Settings,
  UndoBatch,
  UpdateState
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
  ollama: {
    /** True si Ollama responde. Se consulta en bucle mientras se instala. */
    isRunning(): Promise<Result<boolean>>
    recommended(): Promise<Result<ModeloRecomendado[]>>
    /** Arranca la descarga; el progreso llega por onProgress. */
    pull(model: string): Promise<Result<null>>
    cancelPull(): Promise<Result<null>>
    onProgress(callback: (progress: ProgresoDescarga) => void): () => void
    /**
     * Lanza una peticion real con herramientas para comprobar que el modelo
     * responde y sabe usarlas. Detectar que existe no basta.
     */
    probar(): Promise<Result<{ ok: boolean; detalle: string }>>
  }
  agent: {
    /** Conversacion guardada, para pintarla al abrir el chat. */
    history(): Promise<Result<ChatMessage[]>>
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
  brief: {
    /** `withSummary` en false evita la llamada al modelo, que es lo lento. */
    get(withSummary?: boolean): Promise<Result<DailyBrief>>
    /** Solo los numeros, para el boton flotante. */
    contadores(): Promise<Result<{ hoy: number; atrasadas: number }>>
  }
  plan: {
    /** Calcula el reparto sin tocar el calendario. */
    calcular(dias?: number): Promise<Result<PlanEstudio>>
    /** Crea los eventos de un plan ya calculado. */
    aplicar(planId: string): Promise<Result<{ creados: number; fallos: string[] }>>
  }
  updater: {
    /** Estado actual, para pintar algo nada mas abrir sin esperar eventos. */
    get(): Promise<Result<UpdateState>>
    check(): Promise<Result<null>>
    installAndRestart(): Promise<Result<null>>
    /** Se suscribe a los cambios. Devuelve la funcion para darse de baja. */
    onState(callback: (state: UpdateState) => void): () => void
  }
  hud: {
    toggle(): Promise<Result<boolean>>
    close(): Promise<Result<null>>
    /** Desplazamiento en pixeles; se llama mientras se arrastra. */
    move(dx: number, dy: number): Promise<Result<null>>
    /** Crece para ensenar una respuesta, o vuelve a encogerse. */
    expand(open: boolean): Promise<Result<null>>
    /** Abre la ventana grande en una seccion concreta. */
    openApp(): Promise<Result<null>>
  }
  datos: {
    /** Guarda tareas, reglas y conversacion en un fichero. null si se cancela. */
    exportar(): Promise<Result<{ ruta: string; ficheros: number } | null>>
    /** Restaura desde una copia. Requiere reiniciar despues. */
    importar(): Promise<Result<{ ficheros: number } | null>>
  }
  dialog: {
    pickFolder(): Promise<Result<string | null>>
    /**
     * Abre el client_secret_*.json que descarga Google Cloud y guarda las
     * credenciales. Se lee y se extrae en el proceso principal: el secreto no
     * llega a cruzar al renderer en ningun momento.
     */
    importGoogleJson(): Promise<Result<SafeSettings | null>>
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
  agentHistory: 'agent:history',
  agentSend: 'agent:send',
  agentConfirm: 'agent:confirm',
  agentReset: 'agent:reset',
  agentUsage: 'agent:usage',
  agentOllamaModels: 'agent:ollamaModels',
  ollamaIsRunning: 'ollama:isRunning',
  ollamaRecommended: 'ollama:recommended',
  ollamaPull: 'ollama:pull',
  ollamaCancelPull: 'ollama:cancelPull',
  /** Empujado desde main hacia el renderer. */
  ollamaProgress: 'ollama:progress',
  ollamaProbar: 'ollama:probar',
  organizerListRules: 'organizer:listRules',
  organizerSaveRule: 'organizer:saveRule',
  organizerDeleteRule: 'organizer:deleteRule',
  organizerPlan: 'organizer:plan',
  organizerApply: 'organizer:apply',
  organizerHistory: 'organizer:history',
  organizerUndoLast: 'organizer:undoLast',
  briefGet: 'brief:get',
  briefContadores: 'brief:contadores',
  planCalcular: 'plan:calcular',
  planAplicar: 'plan:aplicar',
  updaterGet: 'updater:get',
  updaterCheck: 'updater:check',
  updaterInstall: 'updater:install',
  /** Empujado desde main hacia el renderer, al reves que el resto. */
  updaterState: 'updater:state',
  hudToggle: 'hud:toggle',
  hudClose: 'hud:close',
  hudMove: 'hud:move',
  hudExpand: 'hud:expand',
  hudOpenApp: 'hud:openApp',
  datosExportar: 'datos:exportar',
  datosImportar: 'datos:importar',
  dialogPickFolder: 'dialog:pickFolder',
  dialogImportGoogleJson: 'dialog:importGoogleJson',
  shellOpenExternal: 'shell:openExternal'
} as const
