import { app } from 'electron'
import path from 'node:path'
import type { SafeSettings, Settings } from '@shared/types'
import { CREDENCIALES_EMPAQUETADAS, traeCredenciales } from '../auth/credentials'
import { JsonStore } from './json-store'
import { SecretKeys, SecretStore } from './secret-store'

/** Ajustes no sensibles. Los secretos van aparte, en SecretStore. */
type PlainSettings = Omit<
  Settings,
  | 'googleClientSecret'
  | 'geminiApiKey'
  | 'openrouterApiKey'
  | 'openaiApiKey'
  | 'anthropicApiKey'
  | 'groqApiKey'
  | 'mistralApiKey'
  | 'customApiKey'
>

function defaultRoots(): string[] {
  return [path.join(app.getPath('home'), 'Downloads')]
}

export class SettingsService {
  private readonly store: JsonStore<PlainSettings>

  constructor(private readonly secrets: SecretStore) {
    this.store = new JsonStore<PlainSettings>('settings.json', {
      googleClientId: '',
      // OpenRouter by default: it is the only one that works straight after
      // installing without asking for 8 GB of disk. Paste a key and you have an
      // assistant;
      // quien prefiera Ollama lo cambia en Ajustes.
      llmProvider: 'openrouter',
      geminiModel: 'gemini-2.5-flash',
      openrouterModel: 'anthropic/claude-3.5-haiku',
      openaiModel: 'gpt-4.1-mini',
      anthropicModel: 'claude-3-5-haiku-latest',
      groqModel: 'llama-3.3-70b-versatile',
      mistralModel: 'mistral-small-latest',
      customBaseUrl: 'http://127.0.0.1:1234/v1',
      customModel: '',
      ollamaHost: 'http://127.0.0.1:11434',
      ollamaModel: '',
      dailyBriefTime: '07:30',
      dailyBriefEnabled: true,
      startAtLogin: false,
      lastBriefDate: null,
      hudVisible: false,
      hudX: null,
      hudY: null,
      onboardingDone: false,
      lastSeenVersion: '',
      soundEnabled: true,
      glassEnabled: true,
      managedRoots: defaultRoots()
    })
  }

  /**
   * The full version, for the main process only.
   *
   * If the user has not supplied their own Google credentials, the ones
   * packaged with the app are used. Whatever they save always wins: anyone who
   * wants their own Google Cloud project only has to fill it in.
   */
  all(): Settings {
    const plain = this.store.get()
    const clientId = plain.googleClientId || CREDENCIALES_EMPAQUETADAS.clientId
    const clientSecret =
      this.secrets.get(SecretKeys.googleClientSecret) || CREDENCIALES_EMPAQUETADAS.clientSecret

    return {
      ...plain,
      googleClientId: clientId,
      googleClientSecret: clientSecret,
      geminiApiKey: this.secrets.get(SecretKeys.geminiApiKey) ?? '',
      openrouterApiKey: this.secrets.get(SecretKeys.openrouterApiKey) ?? '',
      openaiApiKey: this.secrets.get(SecretKeys.openaiApiKey) ?? '',
      anthropicApiKey: this.secrets.get(SecretKeys.anthropicApiKey) ?? '',
      groqApiKey: this.secrets.get(SecretKeys.groqApiKey) ?? '',
      mistralApiKey: this.secrets.get(SecretKeys.mistralApiKey) ?? '',
      customApiKey: this.secrets.get(SecretKeys.customApiKey) ?? ''
    }
  }

  /** The version that can cross the IPC: secrets are reduced to a boolean. */
  safe(): SafeSettings {
    return {
      ...this.store.get(),
      hasGoogleClientSecret:
        this.secrets.has(SecretKeys.googleClientSecret) || traeCredenciales(),
      hasGeminiApiKey: this.secrets.has(SecretKeys.geminiApiKey),
      hasOpenrouterApiKey: this.secrets.has(SecretKeys.openrouterApiKey),
      hasOpenaiApiKey: this.secrets.has(SecretKeys.openaiApiKey),
      hasAnthropicApiKey: this.secrets.has(SecretKeys.anthropicApiKey),
      hasGroqApiKey: this.secrets.has(SecretKeys.groqApiKey),
      hasMistralApiKey: this.secrets.has(SecretKeys.mistralApiKey),
      hasCustomApiKey: this.secrets.has(SecretKeys.customApiKey),
      usesOwnCredentials: this.store.get().googleClientId.length > 0,
      canConnect: this.all().googleClientId.length > 0 && this.all().googleClientSecret.length > 0
    }
  }

  update(patch: Partial<Settings>): SafeSettings {
    const {
      googleClientSecret,
      geminiApiKey,
      openrouterApiKey,
      openaiApiKey,
      anthropicApiKey,
      groqApiKey,
      mistralApiKey,
      customApiKey,
      ...plain
    } = patch

    if (googleClientSecret !== undefined) {
      this.secrets.set(SecretKeys.googleClientSecret, googleClientSecret)
    }
    if (geminiApiKey !== undefined) {
      this.secrets.set(SecretKeys.geminiApiKey, geminiApiKey)
    }
    if (openrouterApiKey !== undefined) {
      this.secrets.set(SecretKeys.openrouterApiKey, openrouterApiKey)
    }
    if (openaiApiKey !== undefined) {
      this.secrets.set(SecretKeys.openaiApiKey, openaiApiKey)
    }
    if (anthropicApiKey !== undefined) {
      this.secrets.set(SecretKeys.anthropicApiKey, anthropicApiKey)
    }
    if (mistralApiKey !== undefined) {
      this.secrets.set(SecretKeys.mistralApiKey, mistralApiKey)
    }
    if (groqApiKey !== undefined) {
      this.secrets.set(SecretKeys.groqApiKey, groqApiKey)
    }
    if (customApiKey !== undefined) {
      this.secrets.set(SecretKeys.customApiKey, customApiKey)
    }
    if (Object.keys(plain).length > 0) {
      this.store.set(plain as Partial<PlainSettings>)
    }
    return this.safe()
  }

  /**
   * Everything to zero: factory settings and not one stored credential.
   *
   * It deletes the Google refresh token too, so afterwards you are signed out.
   * That is the only honest reading of "start again": leaving the account
   * connected while claiming everything was erased would be a lie.
   *
   * What it does NOT touch is the user's data — tasks, exams, folder
   * carpetas y la conversacion viven en sus propios files. Esto es el
   * boton de la configuracion, no el de la trituradora.
   */
  reset(): SafeSettings {
    this.secrets.clear()
    this.store.reset()
    return this.safe()
  }
}
