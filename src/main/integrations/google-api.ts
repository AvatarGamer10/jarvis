import type { GoogleAuth } from '../auth/google-oauth'

/** Error de una API de Google con el mensaje ya traducido a algo entendible. */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly raw: unknown
  ) {
    super(message)
    this.name = 'GoogleApiError'
  }
}

interface ErrorBody {
  error?: { message?: string; status?: string }
}

/** Convierte los errores crudos de Google en algo que el usuario pueda accionar. */
function humanize(status: number, body: ErrorBody, url: string): string {
  const raw = body.error?.message ?? `HTTP ${status}`

  if (status === 401) return 'La sesion de Google ha caducado. Vuelve a iniciar sesion en Ajustes.'
  if (status === 429) return 'Google esta limitando las peticiones. Prueba de nuevo en un minuto.'
  if (status >= 500) return 'Google esta teniendo problemas ahora mismo. Intentalo mas tarde.'

  if (status === 403) {
    if (/has not been used|SERVICE_DISABLED|is disabled/i.test(raw)) {
      const api = url.includes('classroom')
        ? 'Classroom'
        : url.includes('calendar')
          ? 'Calendar'
          : 'Drive'
      return `La API de ${api} no esta habilitada en tu proyecto de Google Cloud.`
    }
    return `Permiso denegado. Puede que el administrador del colegio bloquee esta app. (${raw})`
  }

  return raw
}

/**
 * Cliente REST fino sobre las APIs de Google. Anade el token, reintenta una vez
 * si el token estaba caducado y normaliza los errores.
 */
export class GoogleApi {
  constructor(private readonly auth: GoogleAuth) {}

  async get<T>(url: string): Promise<T> {
    return this.request<T>('GET', url)
  }

  async post<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>('POST', url, body)
  }

  async patch<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', url, body)
  }

  async delete(url: string): Promise<void> {
    await this.request<unknown>('DELETE', url)
  }

  private async request<T>(method: string, url: string, body?: unknown, retry = true): Promise<T> {
    const token = await this.auth.getAccessToken()

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })

    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return undefined as T
    }

    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }

    if (!res.ok) {
      // Un 401 aislado suele ser el token justo al caducar: forzamos una
      // renovacion y reintentamos una sola vez para no entrar en bucle.
      if (res.status === 401 && retry) {
        return this.request<T>(method, url, body, false)
      }
      throw new GoogleApiError(humanize(res.status, data as ErrorBody, url), res.status, data)
    }

    return data as T
  }

  /**
   * Recorre todas las paginas de un listado. Google devuelve nextPageToken
   * cuando hay mas resultados.
   */
  async listAll<T>(url: string, key: string, limit = 500): Promise<T[]> {
    const items: T[] = []
    let pageToken: string | undefined

    do {
      const target = new URL(url)
      if (pageToken) target.searchParams.set('pageToken', pageToken)

      const page = await this.get<Record<string, unknown>>(target.toString())
      const batch = (page[key] as T[] | undefined) ?? []
      items.push(...batch)
      pageToken = page.nextPageToken as string | undefined
    } while (pageToken && items.length < limit)

    return items.slice(0, limit)
  }
}
