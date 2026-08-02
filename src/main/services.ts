import { AgentService } from './agent/loop'
import { GeminiProvider } from './agent/providers/gemini'
import type { ToolContext } from './agent/tools'
import { UsageCounter } from './agent/usage'
import { GoogleAuth } from './auth/google-oauth'
import { CalendarService } from './integrations/calendar'
import { ClassroomService } from './integrations/classroom'
import { GoogleApi } from './integrations/google-api'
import { OrganizerService } from './organizer'
import { SecretStore } from './store/secret-store'
import { SettingsService } from './store/settings'

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
  usage: UsageCounter
  agent: AgentService
}

export function createServices(): Services {
  const secrets = new SecretStore()
  const settings = new SettingsService(secrets)
  const auth = new GoogleAuth(settings, secrets)
  const api = new GoogleApi(auth)

  const calendar = new CalendarService(api)
  const classroom = new ClassroomService(api)
  const organizer = new OrganizerService(settings)
  const usage = new UsageCounter()

  // La configuracion se lee en cada llamada, no al construir: asi cambiar la
  // API key en Ajustes tiene efecto sin reiniciar la app.
  const provider = new GeminiProvider(() => {
    const current = settings.all()
    return { apiKey: current.geminiApiKey, model: current.geminiModel }
  }, usage)

  const toolContext = (): ToolContext => ({ calendar, classroom, organizer })

  return {
    secrets,
    settings,
    auth,
    api,
    calendar,
    classroom,
    organizer,
    usage,
    agent: new AgentService(provider, toolContext)
  }
}
