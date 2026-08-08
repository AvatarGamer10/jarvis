import { app, BrowserWindow, dialog, ipcMain, shell, systemPreferences } from 'electron'
import { Channels, type ApplyOutcomeDto } from '@shared/ipc'
import type {
  Exam,
  OllamaPullProgress,
  FileRule,
  LlmProviderId,
  ManualTask,
  ModelBundleId,
  Result,
  Settings
} from '@shared/types'
import { bySubject } from './tasks/grades-core'
import { RECOMMENDED_MODELS } from './integrations/ollama-manager'
import { whatsNewPending } from './whatsNew'
import type { ApplyOutcome } from './organizer/executor'
import { exportData, importData, suggestedBackupName } from './store/exportData'
import type { Services } from './services'
import type { Hud } from './hud'
import type { UpdaterService } from './updater'
import {
  borrarModelos,
  cancelarBundle,
  estadoBundle,
  instalarBundle,
  repararBundle,
  tamanoModelos
} from './model-proxy'

import path from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

/** The renderer does not need every failed move, only the name. */
const toDto = (outcome: ApplyOutcome): ApplyOutcomeDto => ({
  moved: outcome.moved.length,
  failed: outcome.failed.map((f) => ({ file: path.basename(f.move.from), error: f.error }))
})

/**
 * Wraps a handler so no error ever crosses the IPC as a raw exception. The
 * renderer always receives a Result, never a rejected promise with a main
 * process stack trace inside it.
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
   * Called after settings are saved. Main uses it to reschedule the brief and
   * apply start-at-login, which are things only it can do.
   */
  onSettingsChanged: () => void
  /** Brings the main window to the front. */
  onOpenApp: () => void
}

export function registerIpc(
  services: Services,
  hooks: IpcHooks,
  updater: UpdaterService,
  hud: Hud
): void {
  const { auth, settings, calendar, classroom, agent, usage, organizer, ollama, tasks, brief } =
    services
  const { exams, paste } = services
  const { ollamaManager, planner, compat, gemini } = services

  // --- Autenticacion ---
  handle(Channels.authStatus, () => auth.status())
  handle(Channels.authSignIn, () => auth.signIn())
  handle(Channels.authSignOut, async () => {
    await auth.signOut()
    classroom.invalidateCache()
    return null
  })

  handle(Channels.appVersion, () => app.getVersion())
  handle(Channels.appMicrophone, async () => {
    if (process.platform !== 'darwin') {
      // Chromium owns the platform prompt on Windows and Linux.
      return { granted: true, status: 'granted' as const }
    }

    let status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'not-determined') {
      await systemPreferences.askForMediaAccess('microphone')
      status = systemPreferences.getMediaAccessStatus('microphone')
    }

    return { granted: status === 'granted', status }
  })
  handle(Channels.modelsSize, () => tamanoModelos())
  handle(Channels.modelsClear, async () => {
    await borrarModelos()
    return null
  })
  handle(Channels.modelsStatus, (bundle: ModelBundleId) => estadoBundle(bundle))
  handle(Channels.modelsInstall, (bundle: ModelBundleId) => instalarBundle(bundle))
  handle(Channels.modelsRepair, (bundle: ModelBundleId) => repararBundle(bundle))
  handle(Channels.modelsCancel, async (bundle: ModelBundleId) => {
    await cancelarBundle(bundle)
    return null
  })

  // --- Ajustes ---
  handle(Channels.settingsGet, () => settings.safe())
  handle(Channels.settingsUpdate, (patch: Partial<Settings>) => {
    const updated = settings.update(patch)
    hooks.onSettingsChanged()
    return updated
  })
  handle(Channels.settingsReset, async () => {
    const updated = settings.reset()
    // The Google token went with the other secrets; the Classroom cache would
    // otherwise keep showing homework from an account that is no longer there.
    classroom.invalidateCache()
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
  // Proposes only: tasks are created with tasks:add once the user confirms.
  handle(Channels.tasksParsePasted, (text: string) => paste.parse(text))

  // --- Novedades tras actualizar ---
  handle(Channels.whatsNewPending, () => {
    const actuales = settings.all()
    return whatsNewPending(
      app.getVersion(),
      actuales.lastSeenVersion,
      actuales.onboardingDone
    )
  })
  handle(Channels.whatsNewMarkSeen, () => {
    settings.update({ lastSeenVersion: app.getVersion() })
    return null
  })

  // --- Examenes y notas ---
  // The summary is worked out here and not in the renderer: it is the same
  // calculation the agent uses, and keeping it in one place stops the two
  // averages drifting apart.
  handle(Channels.examsList, () => {
    const lista = exams.list()
    return { exams: lista, summary: bySubject(lista) }
  })
  handle(
    Channels.examsAdd,
    (input: { title: string; subject?: string; date: string; weight?: number | null }) =>
      exams.add(input)
  )
  handle(Channels.examsUpdate, (id: string, patch: Partial<Exam>) =>
    exams.update(id, patch)
  )
  handle(Channels.examsRemove, (id: string) => {
    exams.remove(id)
    return null
  })

  // --- Agente ---
  handle(Channels.agentHistory, () => agent.mensajesGuardados())
  handle(Channels.agentSend, (text: string) => agent.send(text))
  handle(Channels.agentConfirm, (actionId: string, approved: boolean) =>
    agent.confirm(actionId, approved)
  )
  handle(Channels.agentReset, () => {
    agent.reset()
    return null
  })
  handle(Channels.agentUsage, () => ({ callsToday: usage.callsToday() }))
  handle(Channels.agentConversations, () => agent.conversations())
  handle(Channels.agentNewConversation, () => {
    agent.newConversation()
    return null
  })
  handle(Channels.agentOpenConversation, (id: string) => agent.openConversation(id))
  handle(Channels.agentDeleteConversation, (id: string) => {
    agent.deleteConversation(id)
    return null
  })
  handle(Channels.agentOllamaModels, () => ollama.listModels())
  handle(Channels.agentModels, (provider: LlmProviderId) =>
    compat[provider]?.listModels() ?? Promise.resolve([])
  )

  /**
   * Actually checks the active provider.
   *
   * Listing models only proves the key exists. Settings needs to say whether
   * the brain *works*, and the only way to know that is to ask it for
   * something: a trivial sentence, no tools, against whichever provider is
   * mismo.
   */
  handle(Channels.agentCheck, async () => {
    const id = settings.all().llmProvider

    if (compat[id]) return compat[id].check()

    const brain = id === 'ollama' ? ollama : gemini
    const model = id === 'ollama' ? settings.all().ollamaModel : settings.all().geminiModel
    if (!model) return { ok: false, detail: 'No model chosen' }

    try {
      await brain.complete({
        system: 'Reply with the single word: ready.',
        history: [{ role: 'user', text: 'ready?' }],
        tools: []
      })
      return { ok: true, detail: `${model} answered` }
    } catch (err) {
      return { ok: false, detail: (err as Error).message }
    }
  })

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
  handle(Channels.briefCounts, () => brief.counts())

  // --- Ollama ---
  handle(Channels.ollamaIsRunning, () => ollamaManager.isRunning())
  handle(Channels.ollamaRecommended, () => [...RECOMMENDED_MODELS])
  handle(Channels.ollamaPull, async (model: string) => {
    // Not awaited: the download is several gigabytes and the renderer would
    // sit blocked. Progress travels on its own channel.
    void ollamaManager.pullModel(model, (progress: OllamaPullProgress) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send(Channels.ollamaProgress, progress)
    )
    return null
  })
  handle(Channels.ollamaCancelPull, () => {
    ollamaManager.cancelPull()
    return null
  })

  /**
   * Prueba de verdad, no solo de presencia.
   *
   * Ollama answering, with a model pulled, does not mean that model knows how
   * to use tools: the ones that do not support them reply with ordinary prose
   * and the chat fails on the first useful message. So it is asked something
   * that forces a tool call, and we check whether it makes one.
   */
  handle(Channels.ollamaTest, async () => {
    try {
      const respuesta = await ollama.complete({
        system:
          'You are an assistant with tools. Use the right tool when asked for data.',
        history: [{ role: 'user', text: 'What tasks do I have written down?' }],
        tools: [
          {
            name: 'tasks_list',
            description: 'Looks up the tasks the user has written down.',
            parameters: { type: 'object', properties: {}, required: [] }
          }
        ]
      })

      if (respuesta.toolCalls.length > 0) {
        return { ok: true, detail: 'The model answers and knows how to use tools.' }
      }

      return {
        ok: false,
        detail:
          'The model answers but did not use the tool. It may not support them; ' +
          'try llama3.1:8b or qwen2.5:7b.'
      }
    } catch (err) {
      return { ok: false, detail: (err as Error).message }
    }
  })

  // --- Planificador de estudio ---
  handle(Channels.planCalcular, (dias: number) => planner.planBlocks(dias))
  handle(Channels.planAplicar, (planId: string) =>
    planner.aplicar(planId, async (b) => {
      await calendar.createEvent({
        title: `Study: ${b.task}`,
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        description: b.subject ? `Subject: ${b.subject}` : undefined
      })
    })
  )

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

  // --- Boton flotante ---
  handle(Channels.hudToggle, () => {
    hud.toggle()
    return hud.visible()
  })
  handle(Channels.hudClose, () => {
    hud.close()
    return null
  })
  handle(Channels.hudMove, (dx: number, dy: number) => {
    hud.move(dx, dy)
    return null
  })
  handle(Channels.hudExpand, (abierto: boolean) => {
    hud.resize(abierto)
    return null
  })
  handle(Channels.hudOpenApp, () => {
    hooks.onOpenApp()
    return null
  })

  // --- Copias de seguridad ---
  handle(Channels.dataExport, async () => {
    const window = BrowserWindow.getFocusedWindow()
    const options = {
      title: 'Save a copy of your data',
      defaultPath: suggestedBackupName(),
      filters: [{ name: 'Vilo backup', extensions: ['json'] }]
    }
    const chosen = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)

    if (chosen.canceled || !chosen.filePath) return null
    const { files } = exportData(chosen.filePath)
    return { path: chosen.filePath, files }
  })

  handle(Channels.dataImport, async () => {
    const window = BrowserWindow.getFocusedWindow()
    const options = {
      title: 'Choose the backup to restore',
      filters: [{ name: 'Vilo backup', extensions: ['json'] }],
      properties: ['openFile' as const]
    }
    const chosen = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (chosen.canceled || !chosen.filePaths[0]) return null
    return importData(chosen.filePaths[0])
  })

  /**
   * Attaching a file to the chat.
   *
   * Text only, and with a ceiling. What is attached ends up inside the prompt,
   * so a binary PDF would be noise and a ten-megabyte file would eat the whole
   * context window — and the bill — without warning anybody.
   */
  handle(Channels.dialogAttachFile, async () => {
    const window = BrowserWindow.getFocusedWindow()
    const options = {
      title: 'Choose a file to attach',
      filters: [
        {
          name: 'Text',
          extensions: ['txt', 'md', 'markdown', 'csv', 'json', 'log', 'rtf', 'tex', 'html', 'xml']
        }
      ],
      properties: ['openFile' as const]
    }
    const chosen = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (chosen.canceled || !chosen.filePaths[0]) return null

    const path = chosen.filePaths[0]
    const { size } = await stat(path)
    const TOPE = 400_000
    if (size > TOPE) {
      throw new Error(
        `That file is ${Math.round(size / 1000)} KB. Attachments are limited to 400 KB — the whole thing has to fit in the model's context.`
      )
    }

    return { name: basename(path), text: await readFile(path, 'utf8'), bytes: size }
  })

  // --- Sistema ---
  handle(Channels.dialogImportGoogleJson, async () => {
    const window = BrowserWindow.getFocusedWindow()
    const options = {
      title: 'Choose the client_secret you downloaded from Google Cloud',
      filters: [{ name: 'Google credentials', extensions: ['json'] }],
      properties: ['openFile' as const]
    }
    const chosen = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (chosen.canceled || !chosen.filePaths[0]) return null

    const raw = await readFile(chosen.filePaths[0], 'utf8')
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      throw new Error('That file is not valid JSON.')
    }

    // Google files the credentials under "installed" for desktop clients and
    // under "web" for server ones; both shapes are accepted.
    const contenedor = (json as { installed?: unknown; web?: unknown }).installed ??
      (json as { web?: unknown }).web ?? json
    const { client_id: clientId, client_secret: clientSecret } = contenedor as {
      client_id?: string
      client_secret?: string
    }

    if (!clientId || !clientSecret) {
      throw new Error(
        'No encuentro client_id y client_secret ahi dentro. ' +
          'Download the JSON from the OAuth client in Google Cloud.'
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
    // The renderer must not be able to open just anything: without this filter
    // a file:// URL or an odd scheme would be a way to run something locally.
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Esquema de URL no permitido: ${parsed.protocol}`)
    }
    await shell.openExternal(url)
    return null
  })
}
