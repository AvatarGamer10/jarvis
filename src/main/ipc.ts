import { ipcMain, shell } from 'electron'
import { Channels } from '@shared/ipc'
import type { Result, Settings } from '@shared/types'
import type { Services } from './services'

/**
 * Envuelve un handler para que ningun error cruce el IPC como excepcion cruda.
 * El renderer siempre recibe un Result, nunca una promesa rechazada con un
 * stack trace del proceso main dentro.
 */
function handle<Args extends unknown[], T>(
  channel: string,
  fn: (...args: Args) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await fn(...(args as Args))
      return { ok: true, data } satisfies Result<T>
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ipc] ${channel}:`, err)
      return { ok: false, error: message } satisfies Result<T>
    }
  })
}

export function registerIpc(services: Services): void {
  const { auth, settings, calendar, classroom } = services

  // --- Autenticacion ---
  handle(Channels.authStatus, () => auth.status())
  handle(Channels.authSignIn, () => auth.signIn())
  handle(Channels.authSignOut, async () => {
    await auth.signOut()
    classroom.invalidateCache()
    return null
  })

  // --- Ajustes ---
  handle(Channels.settingsGet, () => settings.safe())
  handle(Channels.settingsUpdate, (patch: Partial<Settings>) => settings.update(patch))

  // --- Calendario ---
  handle(Channels.calendarList, (timeMin: string, timeMax: string) =>
    calendar.listEvents(timeMin, timeMax)
  )

  // --- Classroom ---
  handle(Channels.classroomList, (force: boolean) => classroom.listAssignments(force))

  // --- Sistema ---
  handle(Channels.shellOpenExternal, async (url: string) => {
    // El renderer no debe poder abrir cualquier cosa: sin este filtro, una URL
    // file:// o un esquema raro seria una via para ejecutar algo en el equipo.
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Esquema de URL no permitido: ${parsed.protocol}`)
    }
    await shell.openExternal(url)
    return null
  })
}
