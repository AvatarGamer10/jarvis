import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { Channels, type ApplyOutcomeDto } from '@shared/ipc'
import type { FileRule, Result, Settings } from '@shared/types'
import type { ApplyOutcome } from './organizer/executor'
import type { Services } from './services'

import path from 'node:path'

/** El renderer no necesita la lista completa de movimientos fallidos, solo el nombre. */
const toDto = (outcome: ApplyOutcome): ApplyOutcomeDto => ({
  moved: outcome.moved.length,
  failed: outcome.failed.map((f) => ({ file: path.basename(f.move.from), error: f.error }))
})

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
  const { auth, settings, calendar, classroom, agent, usage, organizer } = services

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

  // --- Agente ---
  handle(Channels.agentSend, (text: string) => agent.send(text))
  handle(Channels.agentConfirm, (actionId: string, approved: boolean) =>
    agent.confirm(actionId, approved)
  )
  handle(Channels.agentReset, () => {
    agent.reset()
    return null
  })
  handle(Channels.agentUsage, () => ({ callsToday: usage.callsToday() }))

  // --- Organizador de carpetas ---
  handle(Channels.organizerListRules, () => organizer.listRules())
  handle(Channels.organizerSaveRule, (rule: Omit<FileRule, 'id'> & { id?: string }) =>
    organizer.saveRule(rule)
  )
  handle(Channels.organizerDeleteRule, (id: string) => {
    organizer.deleteRule(id)
    return null
  })
  handle(Channels.organizerPlan, () => organizer.plan())
  handle(Channels.organizerApply, (planId: string) => toDto(organizer.apply(planId)))
  handle(Channels.organizerHistory, () => organizer.history())
  handle(Channels.organizerUndoLast, () => toDto(organizer.undoLast()))

  // --- Sistema ---
  handle(Channels.dialogPickFolder, async () => {
    const window = BrowserWindow.getFocusedWindow()
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

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
