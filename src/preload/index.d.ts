import type { JarvisApi } from '@shared/ipc'

declare global {
  interface Window {
    jarvis: JarvisApi
  }
}

export {}
