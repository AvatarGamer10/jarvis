import http from 'node:http'
import crypto from 'node:crypto'
import { shell } from 'electron'
import type { AuthStatus } from '@shared/types'
import { SecretKeys, SecretStore } from '../store/secret-store'
import type { SettingsService } from '../store/settings'

/**
 * The permissions the app asks for. Everything Classroom is READ ONLY, because
 * the API does not allow submitting work created by another app (see the
 * README) — so asking for write access would be asking for something we could
 * never use.
 *
 * drive.file grants access only to the files the app itself creates, not to
 * the whole of your Drive.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
  'https://www.googleapis.com/auth/drive.file'
]

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'

/** How long before expiry the token is refreshed. */
const REFRESH_MARGIN_MS = 60_000

const base64url = (buf: Buffer): string => buf.toString('base64url')

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: string
}

export class GoogleAuth {
  private accessToken: string | null = null
  private expiresAt = 0
  private email: string | null = null
  /** Stops two simultaneous requests kicking off two refreshes at once. */
  private refreshInFlight: Promise<string> | null = null

  constructor(
    private readonly settings: SettingsService,
    private readonly secrets: SecretStore
  ) {}

  isConfigured(): boolean {
    const { googleClientId, googleClientSecret } = this.settings.all()
    return googleClientId.length > 0 && googleClientSecret.length > 0
  }

  hasSession(): boolean {
    return this.secrets.has(SecretKeys.googleRefreshToken)
  }

  async status(): Promise<AuthStatus> {
    if (!this.isConfigured()) {
      return { connected: false, email: null, error: 'Google Cloud credentials are missing.' }
    }
    if (!this.hasSession()) {
      return { connected: false, email: null, error: 'No Google account is signed in.' }
    }
    try {
      await this.getAccessToken()
      return { connected: true, email: this.email }
    } catch (err) {
      return { connected: false, email: null, error: (err as Error).message }
    }
  }

  /**
   * Opens the browser to sign in. Uses PKCE with a loopback redirect, which is
   * the flow Google requires for desktop applications.
   */
  async signIn(): Promise<AuthStatus> {
    const { googleClientId, googleClientSecret } = this.settings.all()
    if (!googleClientId || !googleClientSecret) {
      throw new Error('Add the Google Client ID and Client Secret in Settings first.')
    }

    const verifier = base64url(crypto.randomBytes(48))
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
    const state = base64url(crypto.randomBytes(16))

    const server = http.createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('Vilo could not open the local callback needed for Google sign-in.')
    }
    const redirectUri = `http://127.0.0.1:${address.port}`

    const authUrl = new URL(AUTH_ENDPOINT)
    authUrl.searchParams.set('client_id', googleClientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('access_type', 'offline')
    // Without this, Google only returns a refresh_token the first time.
    authUrl.searchParams.set('prompt', 'consent')

    const codePromise = this.waitForCode(server, redirectUri, state)
    await shell.openExternal(authUrl.toString())

    const code = await codePromise
    const tokens = await this.exchangeCode({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      code,
      verifier,
      redirectUri
    })

    if (!tokens.refresh_token) {
      throw new Error(
        'Google did not return a refresh token. Revoke Vilo at ' +
          'myaccount.google.com/permissions, then connect again.'
      )
    }

    this.secrets.set(SecretKeys.googleRefreshToken, tokens.refresh_token)
    this.applyToken(tokens)
    await this.fetchEmail()

    return { connected: true, email: this.email }
  }

  async signOut(): Promise<void> {
    const refreshToken = this.secrets.get(SecretKeys.googleRefreshToken)
    if (refreshToken) {
      // Revoked on the server, not merely deleted locally: otherwise the app
      // keeps showing as authorised in the Google account.
      await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken })
      }).catch((err) => console.error('[auth] failed to revoke the token:', err))
    }
    this.secrets.set(SecretKeys.googleRefreshToken, null)
    this.accessToken = null
    this.expiresAt = 0
    this.email = null
  }

  /** Returns a valid access token, refreshing it if necessary. */
  async getAccessToken(forceRefresh = false): Promise<string> {
    if (forceRefresh) {
      this.accessToken = null
      this.expiresAt = 0
    }
    if (this.accessToken && Date.now() < this.expiresAt - REFRESH_MARGIN_MS) {
      return this.accessToken
    }
    this.refreshInFlight ??= this.refresh().finally(() => {
      this.refreshInFlight = null
    })
    return this.refreshInFlight
  }

  private async refresh(): Promise<string> {
    const refreshToken = this.secrets.get(SecretKeys.googleRefreshToken)
    if (!refreshToken) {
      throw new Error('Open Settings and connect your Google account first.')
    }

    const { googleClientId, googleClientSecret } = this.settings.all()
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    })

    if (!res.ok) {
      const body = await res.text()
      // invalid_grant after exactly 7 days = the OAuth app is still in
      // "Testing". Fixed by publishing it, not by retrying.
      if (body.includes('invalid_grant')) {
        this.secrets.set(SecretKeys.googleRefreshToken, null)
        throw new Error(
          'Your Google session has expired. If this happens every seven days, publish the OAuth ' +
            'app as “In production” in Google Cloud Console, then connect again.'
        )
      }
      throw new Error(`Vilo could not refresh the Google session: ${body}`)
    }

    const tokens = (await res.json()) as TokenResponse
    this.applyToken(tokens)
    if (!this.email) await this.fetchEmail()
    return tokens.access_token
  }

  private applyToken(tokens: TokenResponse): void {
    this.accessToken = tokens.access_token
    this.expiresAt = Date.now() + tokens.expires_in * 1000
  }

  private async fetchEmail(): Promise<void> {
    try {
      const res = await fetch(USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      })
      if (!res.ok) return
      const data = (await res.json()) as { email?: string }
      this.email = data.email ?? null
    } catch (err) {
      console.error('[auth] could not read the account email:', err)
    }
  }

  private async exchangeCode(params: {
    clientId: string
    clientSecret: string
    code: string
    verifier: string
    redirectUri: string
  }): Promise<TokenResponse> {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        code: params.code,
        code_verifier: params.verifier,
        grant_type: 'authorization_code',
        redirect_uri: params.redirectUri
      })
    })
    if (!res.ok) {
      throw new Error(`Google rejected the authorization code: ${await res.text()}`)
    }
    return (await res.json()) as TokenResponse
  }

  /** Waits for Google to redirect to the local server with the code. */
  private waitForCode(
    server: http.Server,
    redirectUri: string,
    expectedState: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // 15 minutes: Google's flow is several screens and five minutes
      // expired the moment the user stopped to read the unverified-app
      // verificada.
      const timeout = setTimeout(
        () => {
          server.close()
          reject(new Error('Google sign-in timed out after 15 minutes.'))
        },
        15 * 60 * 1000
      )

      const finish = (fn: () => void): void => {
        clearTimeout(timeout)
        server.close()
        fn()
      }

      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', redirectUri)
        const reply = (message: string): void => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(
            `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:3rem;text-align:center">
             <h2>${message}</h2><p>You can close this tab and go back to Vilo.</p></body>`
          )
        }

        const error = url.searchParams.get('error')
        if (error) {
          reply('Autorizaci&oacute;n denegada')
          finish(() => reject(new Error(`Google sign-in returned error=${error}`)))
          return
        }

        // Without checking the state, a malicious page could make the app
        // exchange a code belonging to another account — CSRF over OAuth.
        if (url.searchParams.get('state') !== expectedState) {
          reply('Error de seguridad')
          finish(() => reject(new Error('Google sign-in failed its security check.')))
          return
        }

        const code = url.searchParams.get('code')
        if (!code) {
          reply('Respuesta incompleta')
          finish(() => reject(new Error('Google did not return an authorization code.')))
          return
        }

        reply('Done — Vilo has access now')
        finish(() => resolve(code))
      })
    })
  }
}
