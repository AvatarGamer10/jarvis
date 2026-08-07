import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { Channels, type ApplyOutcomeDto } from '@shared/ipc'
import type { Examen, FileRule, ManualTask, Result, Settings } from '@shared/types'
import { porAsignatura } from './tasks/notas-core'
import { MODELOS_RECOMENDADOS } from './integrations/ollama-manager'
import type { ApplyOutcome } from './organizer/executor'
import { exportar, importar, nombreSugerido } from './store/exportar'
import type { Services } from './services'
import type { Hud } from './hud'
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
  /** Trae la ventana principal al frente. */
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
  const { examenes } = services
  const { ollamaManager, planner } = services

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

  // --- Examenes y notas ---
  // El resumen se calcula aqui y no en el renderer: es la misma cuenta que usa
  // el agente, y tenerla en un solo sitio evita que las dos medias se separen.
  handle(Channels.examenesList, () => {
    const lista = examenes.list()
    return { examenes: lista, resumen: porAsignatura(lista) }
  })
  handle(
    Channels.examenesAdd,
    (input: { title: string; subject?: string; date: string; weight?: number | null }) =>
      examenes.add(input)
  )
  handle(Channels.examenesUpdate, (id: string, patch: Partial<Examen>) =>
    examenes.update(id, patch)
  )
  handle(Channels.examenesRemove, (id: string) => {
    examenes.remove(id)
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
  handle(Channels.briefContadores, () => brief.contadores())

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

  /**
   * Prueba de verdad, no solo de presencia.
   *
   * Que Ollama responda y tenga un modelo descargado no significa que ese
   * modelo sepa usar herramientas: los que no lo soportan contestan con texto
   * corriente y el chat falla al primer mensaje util. Se le pide algo que
   * obliga a llamar a una herramienta y se comprueba si lo hace.
   */
  handle(Channels.ollamaProbar, async () => {
    try {
      const respuesta = await ollama.complete({
        system:
          'Eres un asistente con herramientas. Usa la herramienta adecuada cuando te pidan datos.',
        history: [{ role: 'user', text: '¿Que tareas tengo apuntadas?' }],
        tools: [
          {
            name: 'tasks_list',
            description: 'Consulta las tareas apuntadas por el usuario.',
            parameters: { type: 'object', properties: {}, required: [] }
          }
        ]
      })

      if (respuesta.toolCalls.length > 0) {
        return { ok: true, detalle: 'El modelo responde y sabe usar herramientas.' }
      }

      return {
        ok: false,
        detalle:
          'El modelo responde, pero no ha usado la herramienta. Puede que no las admita; ' +
          'prueba con llama3.1:8b o qwen2.5:7b.'
      }
    } catch (err) {
      return { ok: false, detalle: (err as Error).message }
    }
  })

  // --- Planificador de estudio ---
  handle(Channels.planCalcular, (dias: number) => planner.calcular(dias))
  handle(Channels.planAplicar, (planId: string) =>
    planner.aplicar(planId, async (b) => {
      await calendar.createEvent({
        title: `Estudiar: ${b.tarea}`,
        start: b.inicio.toISOString(),
        end: b.fin.toISOString(),
        description: b.asignatura ? `Asignatura: ${b.asignatura}` : undefined
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
    hud.alternar()
    return hud.visible()
  })
  handle(Channels.hudClose, () => {
    hud.cerrar()
    return null
  })
  handle(Channels.hudMove, (dx: number, dy: number) => {
    hud.mover(dx, dy)
    return null
  })
  handle(Channels.hudExpand, (abierto: boolean) => {
    hud.ajustar(abierto)
    return null
  })
  handle(Channels.hudOpenApp, () => {
    hooks.onOpenApp()
    return null
  })

  // --- Copias de seguridad ---
  handle(Channels.datosExportar, async () => {
    const ventana = BrowserWindow.getFocusedWindow()
    const opciones = {
      title: 'Guardar una copia de tus datos',
      defaultPath: nombreSugerido(),
      filters: [{ name: 'Copia de JARVIS', extensions: ['json'] }]
    }
    const elegido = ventana
      ? await dialog.showSaveDialog(ventana, opciones)
      : await dialog.showSaveDialog(opciones)

    if (elegido.canceled || !elegido.filePath) return null
    const { ficheros } = exportar(elegido.filePath)
    return { ruta: elegido.filePath, ficheros }
  })

  handle(Channels.datosImportar, async () => {
    const ventana = BrowserWindow.getFocusedWindow()
    const opciones = {
      title: 'Elige la copia que quieres restaurar',
      filters: [{ name: 'Copia de JARVIS', extensions: ['json'] }],
      properties: ['openFile' as const]
    }
    const elegido = ventana
      ? await dialog.showOpenDialog(ventana, opciones)
      : await dialog.showOpenDialog(opciones)

    if (elegido.canceled || !elegido.filePaths[0]) return null
    return importar(elegido.filePaths[0])
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
