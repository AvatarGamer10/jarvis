import { contextBridge, ipcRenderer } from 'electron'
import { Channels, type JarvisApi } from '@shared/ipc'
import type { Settings } from '@shared/types'

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
  agent: {
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
  dialog: {
    pickFolder: () => ipcRenderer.invoke(Channels.dialogPickFolder)
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(Channels.shellOpenExternal, url)
  }
}

contextBridge.exposeInMainWorld('jarvis', api)
