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
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(Channels.shellOpenExternal, url)
  }
}

contextBridge.exposeInMainWorld('jarvis', api)
