import type { ViloApi } from '@shared/ipc'

declare global {
  interface Window {
    vilo: ViloApi
  }
}

export {}
