import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'

/**
 * Guarda credenciales (tokens de Google, clave de Gemini) cifradas con
 * `safeStorage`, que por debajo usa el llavero del sistema operativo:
 * DPAPI en Windows y Keychain en macOS. La clave de cifrado nunca esta en
 * nuestro codigo ni en el disco en claro.
 *
 * Solo se instancia en el proceso main. El renderer no tiene acceso a esto.
 */
export class SecretStore {
  private readonly file: string
  private cache: Record<string, string> | null = null

  constructor(filename = 'credentials.bin') {
    this.file = path.join(app.getPath('userData'), filename)
  }

  private available(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  private read(): Record<string, string> {
    if (this.cache) return this.cache

    if (!fs.existsSync(this.file)) {
      this.cache = {}
      return this.cache
    }

    try {
      const encrypted = fs.readFileSync(this.file)
      const plain = this.available()
        ? safeStorage.decryptString(encrypted)
        : encrypted.toString('utf8')
      this.cache = JSON.parse(plain) as Record<string, string>
    } catch (err) {
      // Pasa si el usuario copia el fichero a otro equipo o cambia de cuenta del
      // SO: el llavero de destino no puede descifrar lo del origen. No es
      // recuperable, asi que empezamos de cero y se vuelve a iniciar sesion.
      console.error('[secrets] no se pudo descifrar, se descarta el fichero:', err)
      this.cache = {}
    }
    return this.cache
  }

  private write(): void {
    if (!this.cache) return

    const plain = JSON.stringify(this.cache)
    if (!this.available()) {
      // Windows y macOS siempre tienen cifrado disponible; esto solo saltaria en
      // un Linux sin llavero. Avisamos alto y claro en vez de fallar en silencio.
      console.warn('[secrets] AVISO: el cifrado del sistema no esta disponible, se guarda en claro.')
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, plain, 'utf8')
      return
    }

    const encrypted = safeStorage.encryptString(plain)
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, encrypted)
    fs.renameSync(tmp, this.file)
  }

  get(key: string): string | null {
    return this.read()[key] ?? null
  }

  set(key: string, value: string | null): void {
    const data = this.read()
    if (value === null || value === '') {
      delete data[key]
    } else {
      data[key] = value
    }
    this.write()
  }

  has(key: string): boolean {
    const value = this.get(key)
    return value !== null && value !== ''
  }

  clear(): void {
    this.cache = {}
    this.write()
  }
}

/** Claves usadas en el almacen, en un sitio para que no se repitan literales sueltos. */
export const SecretKeys = {
  googleClientSecret: 'google.client_secret',
  googleRefreshToken: 'google.refresh_token',
  geminiApiKey: 'gemini.api_key'
} as const
