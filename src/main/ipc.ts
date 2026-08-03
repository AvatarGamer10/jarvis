import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { Channels, type ApplyOutcomeDto } from '@shared/ipc'
import type { FileRule, ManualTask, Result, Settings } from '@shared/types'
import { MODELOS_RECOMENDADOS } from './integrations/ollama-manager'
import type { ApplyOutcome } from './organizer/executor'
import type { Services } from './services'
import type { UpdaterService } from './updater'

import path from 'node:path'
import { readFile } from 'node:fs/promises'

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

export interface IpcHooks {
  /**
   * Se llama tras guardar ajustes. Lo usa main para reprogramar el resumen y
   * aplicar el arranque automatico, que son cosas que solo el sabe hacer.
   */
  onSettingsChanged: () => void
}

export function registerIpc(
  services: Services,
  hooks: IpcHooks,
  updater: UpdaterService
): void {
  const { auth, settings, calendar, classroom, agent, usage, organizer, ollama, tasks, brief } =
    services
  const { ollamaManager } = services

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
  handle(Channels.settingsUpdate, (patch: Partial<Settings>) => {
    const updated = settings.update(patch)
    hooks.onSettingsChanged()
    return updated
  })

  // --- Calendario ---
  handle(Channels.calendarList, (timeMin: string, timeMax: string) =>
    calendar.listEvents(timeMin, timeMax)
  )

  // --- Classroom ---
  handle(Channels.classroomList, (force: boolean) => classroom.listAssignments(force))

  // --- Tareas propias ---
  handle(Channels.tasksList, () => tasks.list())
  handle(Channels.tasksAdd, (input: { title: string; subject?: string; dueDate?: string | null }) =>
    tasks.add(input)
  )
  handle(Channels.tasksUpdate, (id: string, patch: Partial<ManualTask>) => tasks.update(id, patch))
  handle(Channels.tasksRemove, (id: string) => {
    tasks.remove(id)
    return null
  })

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
  handle(Channels.agentOllamaModels, () => ollama.listModels())

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

  // --- Resumen diario ---
  handle(Channels.briefGet, (withSummary: boolean) => brief.build(withSummary))

  // --- Ollama ---
  handle(Channels.ollamaIsRunning, () => ollamaManager.estaFuncionando())
  handle(Channels.ollamaRecommended, () => [...MODELOS_RECOMENDADOS])
  handle(Channels.ollamaPull, async (model: string) => {
    // No se espera a que termine: la descarga son varios GB y el renderer se
    // quedaria bloqueado. El progreso viaja por su propio canal.
    void ollamaManager.descargarModelo(model, (progreso) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send(Channels.ollamaProgress, progreso)
    )
    return null
  })
  handle(Channels.ollamaCancelPull, () => {
    ollamaManager.cancelarDescarga()
    return null
  })

  // --- Actualizaciones ---
  handle(Channels.updaterGet, () => updater.estadoActual())
  handle(Channels.updaterCheck, async () => {
    await updater.check()
    return null
  })
  handle(Channels.updaterInstall, () => {
    updater.instalarYReiniciar()
    return null
  })

  // --- Sistema ---
  handle(Channels.dialogImportGoogleJson, async () => {
    const window = BrowserWindow.getFocusedWindow()
    const opciones = {
      title: 'Elige el client_secret que descargaste de Google Cloud',
      filters: [{ name: 'Credenciales de Google', extensions: ['json'] }],
      properties: ['openFile' as const]
    }
    const elegido = window
      ? await dialog.showOpenDialog(window, opciones)
      : await dialog.showOpenDialog(opciones)

    if (elegido.canceled || !elegido.filePaths[0]) return null

    const crudo = await readFile(elegido.filePaths[0], 'utf8')
    let json: unknown
    try {
      json = JSON.parse(crudo)
    } catch {
      throw new Error('Ese fichero no es un JSON valido.')
    }

    // Google mete las credenciales bajo "installed" para clientes de escritorio
    // y bajo "web" para los de servidor; aceptamos las dos formas.
    const contenedor = (json as { installed?: unknown; web?: unknown }).installed ??
      (json as { web?: unknown }).web ?? json
    const { client_id: clientId, client_secret: clientSecret } = contenedor as {
      client_id?: string
      client_secret?: string
    }

    if (!clientId || !clientSecret) {
      throw new Error(
        'No encuentro client_id y client_secret ahi dentro. ' +
          'Descarga el JSON desde el cliente de OAuth en Google Cloud.'
      )
    }

    return settings.update({ googleClientId: clientId, googleClientSecret: clientSecret })
  })

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
