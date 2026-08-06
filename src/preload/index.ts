import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Channels, type JarvisApi } from '@shared/ipc'
import type { ProgresoDescarga, Settings, UpdateState } from '@shared/types'

/**
 * Puente entre el renderer y el proceso main.
 *
 * `contextBridge` copia estas funciones al contexto de la pagina sin darle
 * acceso a `require` ni a `ipcRenderer` directamente. Aunque alguien inyectara
 * codigo en el renderer, solo podria llamar a lo que hay aqui abajo.
 */
const api: JarvisApi = {
  auth: {
    status: () => ipcRenderer.invoke(Channels.authStatus),
    signIn: () => ipcRenderer.invoke(Channels.authSignIn),
    signOut: () => ipcRenderer.invoke(Channels.authSignOut)
  },
  settings: {
    get: () => ipcRenderer.invoke(Channels.settingsGet),
    update: (patch: Partial<Settings>) => ipcRenderer.invoke(Channels.settingsUpdate, patch)
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
    remove: (id: string) => ipcRenderer.invoke(Channels.tasksRemove, id)
  },
  ollama: {
    isRunning: () => ipcRenderer.invoke(Channels.ollamaIsRunning),
    recommended: () => ipcRenderer.invoke(Channels.ollamaRecommended),
    pull: (model: string) => ipcRenderer.invoke(Channels.ollamaPull, model),
    cancelPull: () => ipcRenderer.invoke(Channels.ollamaCancelPull),
    onProgress: (callback: (progress: ProgresoDescarga) => void) => {
      const oyente = (_e: IpcRendererEvent, progress: ProgresoDescarga): void => callback(progress)
      ipcRenderer.on(Channels.ollamaProgress, oyente)
      return () => ipcRenderer.removeListener(Channels.ollamaProgress, oyente)
    },
    probar: () => ipcRenderer.invoke(Channels.ollamaProbar)
  },
  agent: {
    history: () => ipcRenderer.invoke(Channels.agentHistory),
    send: (text: string) => ipcRenderer.invoke(Channels.agentSend, text),
    confirm: (actionId: string, approved: boolean) =>
      ipcRenderer.invoke(Channels.agentConfirm, actionId, approved),
    reset: () => ipcRenderer.invoke(Channels.agentReset),
    usage: () => ipcRenderer.invoke(Channels.agentUsage),
    ollamaModels: () => ipcRenderer.invoke(Channels.agentOllamaModels)
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
    get: (withSummary?: boolean) => ipcRenderer.invoke(Channels.briefGet, withSummary ?? true)
  },
  updater: {
    get: () => ipcRenderer.invoke(Channels.updaterGet),
    check: () => ipcRenderer.invoke(Channels.updaterCheck),
    installAndRestart: () => ipcRenderer.invoke(Channels.updaterInstall),
    onState: (callback: (state: UpdateState) => void) => {
      // Se envuelve el callback en vez de pasarlo tal cual: asi el renderer no
      // recibe el objeto `event` de Electron, que trae el sender dentro.
      const oyente = (_event: IpcRendererEvent, state: UpdateState): void => callback(state)
      ipcRenderer.on(Channels.updaterState, oyente)
      return () => ipcRenderer.removeListener(Channels.updaterState, oyente)
    }
  },
  hud: {
    toggle: () => ipcRenderer.invoke(Channels.hudToggle),
    close: () => ipcRenderer.invoke(Channels.hudClose),
    move: (dx: number, dy: number) => ipcRenderer.invoke(Channels.hudMove, dx, dy),
    expand: (open: boolean) => ipcRenderer.invoke(Channels.hudExpand, open),
    openApp: () => ipcRenderer.invoke(Channels.hudOpenApp)
  },
  datos: {
    exportar: () => ipcRenderer.invoke(Channels.datosExportar),
    importar: () => ipcRenderer.invoke(Channels.datosImportar)
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke(Channels.dialogPickFolder),
    importGoogleJson: () => ipcRenderer.invoke(Channels.dialogImportGoogleJson)
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(Channels.shellOpenExternal, url)
  }
}

contextBridge.exposeInMainWorld('jarvis', api)
