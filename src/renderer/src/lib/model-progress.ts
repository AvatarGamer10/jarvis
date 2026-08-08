import type { ModelBundleId, ModelBundleStatus, ModelDownload } from '@shared/types'

export interface InstallProgress {
  phase: 'downloading' | 'preparing'
  percent: number
  message: string
}

export class ModelInstallError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelInstallError'
  }
}

function readableMb(bytes: number): string {
  return (bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)
}

function present(progress: ModelDownload, noun: string): InstallProgress {
  const percent = progress.total > 0
    ? Math.min(99, Math.round((progress.received / progress.total) * 100))
    : 0

  switch (progress.phase) {
    case 'checking':
      return { phase: 'preparing', percent: 100, message: `Checking ${noun} files…` }
    case 'verifying':
      return { phase: 'preparing', percent: 100, message: `Verifying ${noun}…` }
    case 'ready':
      return { phase: 'preparing', percent: 100, message: `Installed. Starting ${noun}…` }
    case 'cancelled':
      return { phase: 'downloading', percent, message: 'Download paused. Your progress is saved.' }
    case 'downloading':
      return {
        phase: 'downloading',
        percent,
        message: `Downloading ${noun} — ${readableMb(progress.received)} of ${readableMb(progress.total)} MB`
      }
  }
}

/**
 * Runs the durable main-process installer. The renderer does not infer network
 * state from silence or from model startup anymore: it only paints explicit
 * installer events for the requested bundle.
 */
export async function installModelBundle(
  bundle: ModelBundleId,
  noun: string,
  onProgress?: (progress: InstallProgress) => void,
  repair = false
): Promise<ModelBundleStatus> {
  const off = window.vilo.models.onProgress((progress) => {
    if (progress.bundle === bundle) onProgress?.(present(progress, noun))
  })

  onProgress?.({ phase: 'preparing', percent: 100, message: `Checking ${noun} files…` })

  try {
    const result = repair
      ? await window.vilo.models.repair(bundle)
      : await window.vilo.models.install(bundle)

    if (!result.ok) throw new ModelInstallError(result.error)
    if (!result.data.installed) throw new ModelInstallError(`Vilo could not verify ${noun}`)

    onProgress?.({ phase: 'preparing', percent: 100, message: `Installed. Starting ${noun}…` })
    return result.data
  } finally {
    off()
  }
}
