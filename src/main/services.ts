import { ChatStore } from './agent/chat-store'
import { AgentService } from './agent/loop'
import { GeminiProvider } from './agent/providers/gemini'
import { OllamaProvider } from './agent/providers/ollama'
import {
  BRANDS,
  OpenAiCompatibleProvider,
  type CompatConfig
} from './agent/providers/openai-compatible'
import { ProviderRouter } from './agent/providers/router'
import type { LLMProvider } from './agent/provider'
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
import { ExamenService } from './tasks/exams'
import { ManualTaskService } from './tasks/manual-tasks'
import { PasteService } from './tasks/paste'

/**
 * The service container. Built once, when the app is ready — not before:
 * several pieces need `app.getPath`, which does not exist yet.
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
  exams: ExamenService
  paste: PasteService
  ollama: OllamaProvider
  gemini: GeminiProvider
  /** The ones that speak the OpenAI dialect, by id. */
  compat: Record<string, OpenAiCompatibleProvider>
  ollamaManager: OllamaManager
  usage: UsageCounter
  agent: AgentService
  brief: BriefService
  planner: PlannerService
  /** Started from main, which is what knows how to notify. */
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
  const exams = new ExamenService()
  const usage = new UsageCounter()

  // Configuration is read on every call rather than at construction: that way
  // changing the API key or the model in Settings takes effect without a
  // restart.
  const gemini = new GeminiProvider(() => {
    const current = settings.all()
    return { apiKey: current.geminiApiKey, model: current.geminiModel }
  })

  const ollama = new OllamaProvider(() => {
    const current = settings.all()
    return { host: current.ollamaHost, model: current.ollamaModel }
  })

  /**
   * Every OpenAI-compatible service comes out of the same class.
   *
   * Each reads its own settings on every call, like the others, so switching
   * provider in Settings takes effect without a restart.
   */
  const compatConfig: Record<string, () => CompatConfig> = {
    openrouter: () => {
      const current = settings.all()
      return { apiKey: current.openrouterApiKey, model: current.openrouterModel }
    },
    openai: () => {
      const current = settings.all()
      return { apiKey: current.openaiApiKey, model: current.openaiModel }
    },
    anthropic: () => {
      const current = settings.all()
      return { apiKey: current.anthropicApiKey, model: current.anthropicModel }
    },
    groq: () => {
      const current = settings.all()
      return { apiKey: current.groqApiKey, model: current.groqModel }
    },
    mistral: () => {
      const current = settings.all()
      return { apiKey: current.mistralApiKey, model: current.mistralModel }
    },
    custom: () => {
      const current = settings.all()
      return {
        apiKey: current.customApiKey,
        model: current.customModel,
        baseUrl: current.customBaseUrl
      }
    }
  }

  const compat: Record<string, OpenAiCompatibleProvider> = Object.fromEntries(
    Object.entries(compatConfig).map(([id, read]) => [
      id,
      new OpenAiCompatibleProvider(BRANDS[id], read)
    ])
  )

  const brains: Record<string, () => LLMProvider> = {
    gemini: () => gemini,
    ollama: () => ollama,
    ...Object.fromEntries(Object.keys(compat).map((id) => [id, () => compat[id]]))
  }

  const provider = new ProviderRouter(
    () => (brains[settings.all().llmProvider] ?? brains.openrouter)(),
    usage
  )

  const toolContext = (): ToolContext => ({ calendar, classroom, organizer, tasks, exams })
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
    exams,
    paste: new PasteService(provider),
    ollama,
    gemini,
    compat,
    ollamaManager: new OllamaManager(settings),
    usage,
    agent: new AgentService(provider, toolContext, new ChatStore()),
    brief: new BriefService(calendar, classroom, tasks, exams, provider),
    planner,
    scheduler: (onFire) => new BriefScheduler(settings, onFire)
  }
}
