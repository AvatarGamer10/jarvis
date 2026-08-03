import { app } from 'electron'
import path from 'node:path'
import type { SafeSettings, Settings } from '@shared/types'
import { JsonStore } from './json-store'
import { SecretKeys, SecretStore } from './secret-store'

/** Ajustes no sensibles. Los secretos van aparte, en SecretStore. */
type PlainSettings = Omit<Settings, 'googleClientSecret' | 'geminiApiKey'>

function defaultRoots(): string[] {
  return [path.join(app.getPath('home'), 'Downloads')]
}

export class SettingsService {
  private readonly store: JsonStore<PlainSettings>

  constructor(private readonly secrets: SecretStore) {
    this.store = new JsonStore<PlainSettings>('settings.json', {
      googleClientId: '',
      llmProvider: 'ollama',
      geminiModel: 'gemini-2.5-flash',
      ollamaHost: 'http://127.0.0.1:11434',
      ollamaModel: '',
      dailyBriefTime: '07:30',
      dailyBriefEnabled: true,
      startAtLogin: false,
      onboardingDone: false,
      soundEnabled: true,
      glassEnabled: true,
      managedRoots: defaultRoots()
    })
  }

  /** Version completa, solo para uso interno del proceso main. */
  all(): Settings {
    const plain = this.store.get()
    return {
      ...plain,
      googleClientSecret: this.secrets.get(SecretKeys.googleClientSecret) ?? '',
      geminiApiKey: this.secrets.get(SecretKeys.geminiApiKey) ?? ''
    }
  }

  /** Version que puede cruzar el IPC: los secretos se reducen a un booleano. */
  safe(): SafeSettings {
    return {
      ...this.store.get(),
      hasGoogleClientSecret: this.secrets.has(SecretKeys.googleClientSecret),
      hasGeminiApiKey: this.secrets.has(SecretKeys.geminiApiKey)
    }
  }

  update(patch: Partial<Settings>): SafeSettings {
    const { googleClientSecret, geminiApiKey, ...plain } = patch

    if (googleClientSecret !== undefined) {
      this.secrets.set(SecretKeys.googleClientSecret, googleClientSecret)
    }
    if (geminiApiKey !== undefined) {
      this.secrets.set(SecretKeys.geminiApiKey, geminiApiKey)
    }
    if (Object.keys(plain).length > 0) {
      this.store.set(plain as Partial<PlainSettings>)
    }
    return this.safe()
  }
}
