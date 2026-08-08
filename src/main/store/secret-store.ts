import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'

/**
 * Stores credentials — Google tokens, API keys — encrypted with `safeStorage`,
 * which underneath uses the operating system's keychain: DPAPI on Windows and
 * Keychain on macOS. The encryption key is never in our code, nor on disk in
 * the clear.
 *
 * Only instantiated in the main process. The renderer has no access to it.
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
      // Happens if the file is copied to another machine, or the OS account
      // changes: the destination keychain cannot decrypt what the source wrote.
      // It is not recoverable, so we start over and they sign in again.
      console.error('[secrets] could not decrypt; discarding the file:', err)
      this.cache = {}
    }
    return this.cache
  }

  private write(): void {
    if (!this.cache) return

    const plain = JSON.stringify(this.cache)
    if (!this.available()) {
      // Windows y macOS siempre tienen cifrado disponible; esto solo saltaria en
      // a Linux with no keyring. Say so loudly rather than failing quietly.
      console.warn('[secrets] WARNING: system encryption is unavailable; storing in the clear.')
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

/** The keys used in the store, in one place so no loose literals repeat. */
export const SecretKeys = {
  googleClientSecret: 'google.client_secret',
  googleRefreshToken: 'google.refresh_token',
  geminiApiKey: 'gemini.api_key',
  openrouterApiKey: 'openrouter.api_key',
  openaiApiKey: 'openai.api_key',
  anthropicApiKey: 'anthropic.api_key',
  groqApiKey: 'groq.api_key',
  mistralApiKey: 'mistral.api_key',
  customApiKey: 'custom.api_key'
} as const
