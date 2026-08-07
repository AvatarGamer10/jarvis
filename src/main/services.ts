import { ChatStore } from './agent/chat-store'
import { AgentService } from './agent/loop'
import { GeminiProvider } from './agent/providers/gemini'
import { OllamaProvider } from './agent/providers/ollama'
import { ProviderRouter } from './agent/providers/router'
import type { ToolContext } from './agent/tools'
import { PlannerService } from './agent/tools/planner-service'
import { UsageCounter } from './agent/usage'
import { GoogleAuth } from './auth/google-oauth'
import { BriefService } from './brief/daily-brief'
import { BriefScheduler } from './brief/scheduler'
import { CalendarService } from './integrations/calendar'
import { ClassroomService } from './integrations/classroom'
import { GoogleApi } from './integrations/google-api'
import { OllamaManager } from './integrations/ollama-manager'
import { OrganizerService } from './organizer'
import { SecretStore } from './store/secret-store'
import { SettingsService } from './store/settings'
import { ExamenService } from './tasks/examenes'
import { ManualTaskService } from './tasks/manual-tasks'
import { PegarService } from './tasks/pegar'

/**
 * Contenedor de servicios. Se crea una sola vez cuando la app esta lista
 * (no antes: varias piezas necesitan `app.getPath`, que aun no existe).
 */
export interface Services {
  secrets: SecretStore
  settings: SettingsService
  auth: GoogleAuth
  api: GoogleApi
  calendar: CalendarService
  classroom: ClassroomService
  organizer: OrganizerService
  tasks: ManualTaskService
  examenes: ExamenService
  pegar: PegarService
  ollama: OllamaProvider
  ollamaManager: OllamaManager
  usage: UsageCounter
  agent: AgentService
  brief: BriefService
  planner: PlannerService
  /** Se arranca desde main, que es quien sabe como notificar. */
  scheduler: (onFire: () => void) => BriefScheduler
}

export function createServices(): Services {
  const secrets = new SecretStore()
  const settings = new SettingsService(secrets)
  const auth = new GoogleAuth(settings, secrets)
  const api = new GoogleApi(auth)

  const calendar = new CalendarService(api)
  const classroom = new ClassroomService(api)
  const organizer = new OrganizerService(settings)
  const tasks = new ManualTaskService()
  const examenes = new ExamenService()
  const usage = new UsageCounter()

  // La configuracion se lee en cada llamada, no al construir: asi cambiar la
  // API key o el modelo en Ajustes tiene efecto sin reiniciar la app.
  const gemini = new GeminiProvider(() => {
    const current = settings.all()
    return { apiKey: current.geminiApiKey, model: current.geminiModel }
  })

  const ollama = new OllamaProvider(() => {
    const current = settings.all()
    return { host: current.ollamaHost, model: current.ollamaModel }
  })

  const provider = new ProviderRouter(
    () => (settings.all().llmProvider === 'gemini' ? gemini : ollama),
    usage
  )

  const toolContext = (): ToolContext => ({ calendar, classroom, organizer, tasks, examenes })
  const planner = new PlannerService(toolContext)

  return {
    secrets,
    settings,
    auth,
    api,
    calendar,
    classroom,
    organizer,
    tasks,
    examenes,
    pegar: new PegarService(provider),
    ollama,
    ollamaManager: new OllamaManager(settings),
    usage,
    agent: new AgentService(provider, toolContext, new ChatStore()),
    brief: new BriefService(calendar, classroom, tasks, examenes, provider),
    planner,
    scheduler: (onFire) => new BriefScheduler(settings, onFire)
  }
}
