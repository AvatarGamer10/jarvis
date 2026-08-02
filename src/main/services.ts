import { GoogleAuth } from './auth/google-oauth'
import { CalendarService } from './integrations/calendar'
import { ClassroomService } from './integrations/classroom'
import { GoogleApi } from './integrations/google-api'
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
}

export function createServices(): Services {
  const secrets = new SecretStore()
  const settings = new SettingsService(secrets)
  const auth = new GoogleAuth(settings, secrets)
  const api = new GoogleApi(auth)

  return {
    secrets,
    settings,
    auth,
    api,
    calendar: new CalendarService(api),
    classroom: new ClassroomService(api)
  }
}
