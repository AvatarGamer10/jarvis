import http from 'node:http'
import crypto from 'node:crypto'
import { shell } from 'electron'
import type { AuthStatus } from '@shared/types'
import { SecretKeys, SecretStore } from '../store/secret-store'
import type { SettingsService } from '../store/settings'

/**
 * Permisos que pide la app. Todo lo de Classroom es SOLO LECTURA porque la API
 * no permite entregar tareas creadas por otra app (ver README), asi que pedir
 * permiso de escritura seria pedir algo que no vamos a poder usar.
 *
 * drive.file da acceso unicamente a los ficheros que crea la propia app, no a
 * todo tu Drive.
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

/** Margen antes de que caduque el token para renovarlo con antelacion. */
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
  /** Evita que dos peticiones simultaneas lancen dos renovaciones a la vez. */
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
      return { connected: false, email: null, error: 'Faltan las credenciales de Google Cloud.' }
    }
    if (!this.hasSession()) {
      return { connected: false, email: null, error: 'Sin sesion iniciada.' }
    }
    try {
      await this.getAccessToken()
      return { connected: true, email: this.email }
    } catch (err) {
      return { connected: false, email: null, error: (err as Error).message }
    }
  }

  /**
   * Abre el navegador para iniciar sesion. Usa PKCE con redireccion a loopback,
   * que es el flujo que Google exige para aplicaciones de escritorio.
   */
  async signIn(): Promise<AuthStatus> {
    const { googleClientId, googleClientSecret } = this.settings.all()
    if (!googleClientId || !googleClientSecret) {
      throw new Error('Configura primero el Client ID y el Client Secret en Ajustes.')
    }

    const verifier = base64url(crypto.randomBytes(48))
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
    const state = base64url(crypto.randomBytes(16))

    const server = http.createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('No se pudo abrir el servidor local para recibir la respuesta de Google.')
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
    // Sin esto, Google solo devuelve refresh_token la primera vez que autorizas.
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
        'Google no devolvio un refresh token. Revoca el acceso a la app en ' +
          'myaccount.google.com/permissions y vuelve a iniciar sesion.'
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
      // Revocar en el servidor, no solo borrar en local: si no, la app sigue
      // apareciendo con permisos concedidos en la cuenta de Google.
      await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken })
      }).catch((err) => console.error('[auth] fallo al revocar el token:', err))
    }
    this.secrets.set(SecretKeys.googleRefreshToken, null)
    this.accessToken = null
    this.expiresAt = 0
    this.email = null
  }

  /** Devuelve un access token valido, renovandolo si hace falta. */
  async getAccessToken(): Promise<string> {
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
    if (!refreshToken) throw new Error('No hay sesion de Google iniciada.')

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
      // invalid_grant tras exactamente 7 dias = la app OAuth sigue en modo
      // "Testing". Se arregla publicandola, no reintentando.
      if (body.includes('invalid_grant')) {
        this.secrets.set(SecretKeys.googleRefreshToken, null)
        throw new Error(
          'La sesion ha caducado. Si te pasa cada 7 dias, publica la app OAuth ' +
            '("In production") en Google Cloud Console.'
        )
      }
      throw new Error(`No se pudo renovar la sesion de Google: ${body}`)
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
      console.error('[auth] no se pudo leer el email de la cuenta:', err)
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
      throw new Error(`Google rechazo el codigo de autorizacion: ${await res.text()}`)
    }
    return (await res.json()) as TokenResponse
  }

  /** Espera a que Google redirija al servidor local con el codigo. */
  private waitForCode(
    server: http.Server,
    redirectUri: string,
    expectedState: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          server.close()
          reject(new Error('Se agoto el tiempo de espera del inicio de sesion (5 minutos).'))
        },
        5 * 60 * 1000
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
             <h2>${message}</h2><p>Ya puedes cerrar esta pesta&ntilde;a y volver a JARVIS.</p></body>`
          )
        }

        const error = url.searchParams.get('error')
        if (error) {
          reply('Autorizaci&oacute;n denegada')
          finish(() => reject(new Error(`Google devolvio error=${error}`)))
          return
        }

        // Sin comprobar el state, una web maliciosa podria hacer que la app
        // canjeara un codigo de otra cuenta (CSRF sobre el flujo OAuth).
        if (url.searchParams.get('state') !== expectedState) {
          reply('Error de seguridad')
          finish(() => reject(new Error('El parametro state no coincide.')))
          return
        }

        const code = url.searchParams.get('code')
        if (!code) {
          reply('Respuesta incompleta')
          finish(() => reject(new Error('Google no devolvio ningun codigo.')))
          return
        }

        reply('Listo, JARVIS ya tiene acceso')
        finish(() => resolve(code))
      })
    })
  }
}
