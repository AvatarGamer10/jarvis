import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Channels, type ViloApi } from '@shared/ipc'
import type {
  ModelBundleId,
  ModelDownload,
  OllamaPullProgress,
  Settings,
  UpdateState
} from '@shared/types'

/**
 * Puente entre el renderer y el proceso main.
 *
 * `contextBridge` copies these functions into the page's context without
 * giving it
 * acceso a `require` ni a `ipcRenderer` directamente. Aunque alguien inyectara
 * code into the renderer, all it could call is what is written below.
 */
const api: ViloApi = {
  auth: {
    status: () => ipcRenderer.invoke(Channels.authStatus),
    signIn: () => ipcRenderer.invoke(Channels.authSignIn),
    signOut: () => ipcRenderer.invoke(Channels.authSignOut)
  },
  app: {
    version: () => ipcRenderer.invoke(Channels.appVersion),
    microphone: () => ipcRenderer.invoke(Channels.appMicrophone)
  },
  models: {
    size: () => ipcRenderer.invoke(Channels.modelsSize),
    clear: () => ipcRenderer.invoke(Channels.modelsClear),
    status: (bundle: ModelBundleId) => ipcRenderer.invoke(Channels.modelsStatus, bundle),
    install: (bundle: ModelBundleId) => ipcRenderer.invoke(Channels.modelsInstall, bundle),
    repair: (bundle: ModelBundleId) => ipcRenderer.invoke(Channels.modelsRepair, bundle),
    cancel: (bundle: ModelBundleId) => ipcRenderer.invoke(Channels.modelsCancel, bundle),
    onProgress: (callback: (progress: ModelDownload) => void) => {
      const listener = (_e: IpcRendererEvent, progress: ModelDownload): void => callback(progress)
      ipcRenderer.on(Channels.modelProgress, listener)
      return () => ipcRenderer.removeListener(Channels.modelProgress, listener)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(Channels.settingsGet),
    update: (patch: Partial<Settings>) => ipcRenderer.invoke(Channels.settingsUpdate, patch),
    reset: () => ipcRenderer.invoke(Channels.settingsReset)
  },
  calendar: {
    list: (timeMin: string, timeMax: string) =>
      ipcRenderer.invoke(Channels.calendarList, timeMin, timeMax)
  },
  classroom: {
    list: (force?: boolean) => ipcRenderer.invoke(Channels.classroomList, force ?? false)
  },
  tasks: {
    list: () => ipcRenderer.invoke(Channels.tasksList),
    add: (input) => ipcRenderer.invoke(Channels.tasksAdd, input),
    update: (id, patch) => ipcRenderer.invoke(Channels.tasksUpdate, id, patch),
    remove: (id: string) => ipcRenderer.invoke(Channels.tasksRemove, id),
    parsePasted: (texto: string) =>
      ipcRenderer.invoke(Channels.tasksParsePasted, texto)
  },
  exams: {
    list: () => ipcRenderer.invoke(Channels.examsList),
    add: (input) => ipcRenderer.invoke(Channels.examsAdd, input),
    update: (id, patch) => ipcRenderer.invoke(Channels.examsUpdate, id, patch),
    remove: (id: string) => ipcRenderer.invoke(Channels.examsRemove, id)
  },
  ollama: {
    isRunning: () => ipcRenderer.invoke(Channels.ollamaIsRunning),
    recommended: () => ipcRenderer.invoke(Channels.ollamaRecommended),
    pull: (model: string) => ipcRenderer.invoke(Channels.ollamaPull, model),
    cancelPull: () => ipcRenderer.invoke(Channels.ollamaCancelPull),
    onProgress: (callback: (progress: OllamaPullProgress) => void) => {
      const listener = (_e: IpcRendererEvent, progress: OllamaPullProgress): void => callback(progress)
      ipcRenderer.on(Channels.ollamaProgress, listener)
      return () => ipcRenderer.removeListener(Channels.ollamaProgress, listener)
    },
    test: () => ipcRenderer.invoke(Channels.ollamaTest)
  },
  agent: {
    history: () => ipcRenderer.invoke(Channels.agentHistory),
    send: (text: string) => ipcRenderer.invoke(Channels.agentSend, text),
    confirm: (actionId: string, approved: boolean) =>
      ipcRenderer.invoke(Channels.agentConfirm, actionId, approved),
    reset: () => ipcRenderer.invoke(Channels.agentReset),
    conversations: () => ipcRenderer.invoke(Channels.agentConversations),
    newConversation: () => ipcRenderer.invoke(Channels.agentNewConversation),
    openConversation: (id: string) => ipcRenderer.invoke(Channels.agentOpenConversation, id),
    deleteConversation: (id: string) => ipcRenderer.invoke(Channels.agentDeleteConversation, id),
    usage: () => ipcRenderer.invoke(Channels.agentUsage),
    ollamaModels: () => ipcRenderer.invoke(Channels.agentOllamaModels),
    models: (provider) => ipcRenderer.invoke(Channels.agentModels, provider),
    check: () => ipcRenderer.invoke(Channels.agentCheck)
  },
  organizer: {
    listRules: () => ipcRenderer.invoke(Channels.organizerListRules),
    saveRule: (rule) => ipcRenderer.invoke(Channels.organizerSaveRule, rule),
    deleteRule: (id: string) => ipcRenderer.invoke(Channels.organizerDeleteRule, id),
    plan: () => ipcRenderer.invoke(Channels.organizerPlan),
    apply: (planId: string) => ipcRenderer.invoke(Channels.organizerApply, planId),
    history: () => ipcRenderer.invoke(Channels.organizerHistory),
    undoLast: () => ipcRenderer.invoke(Channels.organizerUndoLast)
  },
  brief: {
    get: (withSummary?: boolean) => ipcRenderer.invoke(Channels.briefGet, withSummary ?? true),
    counts: () => ipcRenderer.invoke(Channels.briefCounts)
  },
  plan: {
    planBlocks: (dias?: number) => ipcRenderer.invoke(Channels.planCalcular, dias ?? 7),
    aplicar: (planId: string) => ipcRenderer.invoke(Channels.planAplicar, planId)
  },
  whatsNew: {
    pending: () => ipcRenderer.invoke(Channels.whatsNewPending),
    markSeen: () => ipcRenderer.invoke(Channels.whatsNewMarkSeen)
  },
  updater: {
    get: () => ipcRenderer.invoke(Channels.updaterGet),
    check: () => ipcRenderer.invoke(Channels.updaterCheck),
    installAndRestart: () => ipcRenderer.invoke(Channels.updaterInstall),
    onState: (callback: (state: UpdateState) => void) => {
      // The callback is wrapped rather than passed straight through: that way
      // the renderer never receives Electron's `event` object, which carries
      // the sender inside it.
      const listener = (_event: IpcRendererEvent, state: UpdateState): void => callback(state)
      ipcRenderer.on(Channels.updaterState, listener)
      return () => ipcRenderer.removeListener(Channels.updaterState, listener)
    }
  },
  hud: {
    toggle: () => ipcRenderer.invoke(Channels.hudToggle),
    close: () => ipcRenderer.invoke(Channels.hudClose),
    move: (dx: number, dy: number) => ipcRenderer.invoke(Channels.hudMove, dx, dy),
    expand: (open: boolean) => ipcRenderer.invoke(Channels.hudExpand, open),
    openApp: () => ipcRenderer.invoke(Channels.hudOpenApp)
  },
  data: {
    exportData: () => ipcRenderer.invoke(Channels.dataExport),
    importData: () => ipcRenderer.invoke(Channels.dataImport)
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke(Channels.dialogPickFolder),
    importGoogleJson: () => ipcRenderer.invoke(Channels.dialogImportGoogleJson),
    attachFile: () => ipcRenderer.invoke(Channels.dialogAttachFile)
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(Channels.shellOpenExternal, url)
  }
}

contextBridge.exposeInMainWorld('vilo', api)
