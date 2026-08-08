import type { GoogleAuth } from '../auth/google-oauth'

/** A Google API error whose message is already understandable. */
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

/** Turns Google's raw errors into something the user can act on. */
function humanize(status: number, body: ErrorBody, url: string): string {
  const raw = body.error?.message ?? `HTTP ${status}`

  if (status === 401) return 'Your Google session expired. Connect again in Settings.'
  if (status === 429) return 'Google is limiting requests. Try again in a minute.'
  if (status >= 500) return 'Google is having trouble right now. Try again later.'

  if (status === 403) {
    if (/has not been used|SERVICE_DISABLED|is disabled/i.test(raw)) {
      const api = url.includes('classroom')
        ? 'Classroom'
        : url.includes('calendar')
          ? 'Calendar'
          : 'Drive'
      return `The ${api} API is not enabled in your Google Cloud project.`
    }
    return `Permission denied. Your school administrator may be blocking this app. (${raw})`
  }

  return raw
}

/**
 * A thin REST client over Google's APIs. Adds the token, retries once if the
 * token had expired, and normalises the errors.
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
      // A lone 401 is usually the token expiring right then: force a refresh
      // and retry exactly once, so this cannot become a loop.
      if (res.status === 401 && retry) {
        await this.auth.getAccessToken(true)
        return this.request<T>(method, url, body, false)
      }
      throw new GoogleApiError(humanize(res.status, data as ErrorBody, url), res.status, data)
    }

    return data as T
  }

  /**
   * Walks every page of a listing. Google returns nextPageToken
   * when there are more results.
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
