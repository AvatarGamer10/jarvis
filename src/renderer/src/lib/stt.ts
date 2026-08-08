import type { ModelBundleId } from '@shared/types'
import { speechSegment } from './audio-speech'
import { installModelBundle, ModelInstallError } from './model-progress'

/**
 * Speech recognition with Whisper running inside the app.
 *
 * It executes in WebAssembly, so there is nothing native to compile and
 * nothing extra to install. More importantly, your voice never leaves the
 * machine — which is the whole reason it is done this way and not by posting
 * the audio to whichever API is answering the chat.
 *
 * The price is a one-time download, and keeping that price honest is most of
 * what this file is about.
 */

export type Quality = 'small' | 'balanced'

interface Build {
  model: string
  dtype: 'q8'
  /** Megabytes, measured against the hub. It is shown on screen, so it is true. */
  mb: number
}

/**
 * One model per size. Not a list of fallbacks.
 *
 * There used to be two or three per quality, and when the first failed the app
 * moved to the next — a different repository, different files, and the download
 * starting again from zero. On screen that was a bar filling halfway, resetting,
 * and announcing it was "trying another source", over and over, for a problem
 * that had nothing to do with the source.
 *
 * The failure it was meant to cover was never real. It was a truncated file
 * being cached and then failing to open, which looks like a bad build rather
 * than a bad download — see the size check in model-proxy.ts. Both repositories
 * are healthy; that was checked against the live hub. So there is nothing to
 * fall back to, and pretending otherwise only made a recoverable failure worse.
 *
 * On sizes: these are measured, not estimated. An earlier version advertised
 * 145 MB and fetched 291, because it asked for unquantised weights — the
 * runtime of the day could not open the quantised ones. The runtime bundled now
 * can, which is what takes whisper-base down to 80 MB.
 */
const BUILDS: Record<Quality, Build> = {
  // English only and about half the size. For anyone who is short of disk,
  // which is a normal thing for a student laptop to be.
  small: { model: 'onnx-community/whisper-tiny.en', dtype: 'q8', mb: 45 },
  // The default. Handles accents and background noise noticeably better, and
  // "tiny" starts inventing words the moment either is present.
  balanced: { model: 'onnx-community/whisper-base', dtype: 'q8', mb: 81 }
}

export const QUALITY_INFO: Record<Quality, { label: string; detail: string; mb: number }> = {
  small: {
    label: 'Small',
    detail: 'English only. Quickest to download and lightest to run.',
    mb: BUILDS.small.mb
  },
  balanced: {
    label: 'Balanced',
    detail: 'Handles accents and noisy rooms far better. Recommended.',
    mb: BUILDS.balanced.mb
  }
}

/** Remembered so the second launch does not ask again. */
const CHOICE = 'vilo.voice.quality'

export function savedQuality(): Quality {
  return localStorage.getItem(CHOICE) === 'small' ? 'small' : 'balanced'
}

export function rememberQuality(quality: Quality): void {
  localStorage.setItem(CHOICE, quality)
}

export const bundleForQuality = (quality: Quality): ModelBundleId =>
  quality === 'small' ? 'stt-small' : 'stt-balanced'

export interface ModelProgress {
  phase: 'downloading' | 'preparing' | 'ready' | 'error'
  percent: number
  message: string
  /** Download failures resume; engine failures offer a clean repair. */
  kind?: 'download' | 'engine'
  /** Only set on 'error'. Something the user can actually act on. */
  hint?: string
}

type WorkerRequest =
  | { id: number; type: 'load'; model: string; dtype: 'q8' }
  | { id: number; type: 'transcribe'; audio: ArrayBuffer }

type WorkerCommand =
  | { type: 'load'; model: string; dtype: 'q8' }
  | { type: 'transcribe'; audio: ArrayBuffer }

type WorkerResponse =
  | { id: number; ok: true; text?: string }
  | { id: number; ok: false; error: string }

interface PendingWorkerCall {
  resolve: (text: string) => void
  reject: (error: Error) => void
}

let ready = false
let loading: Promise<void> | null = null
let worker: Worker | null = null
let nextWorkerCall = 0
const pendingWorkerCalls = new Map<number, PendingWorkerCall>()

function listeningWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('./stt.worker.ts', import.meta.url), {
    type: 'module',
    name: 'vilo-listening-engine'
  })

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data
    const pending = pendingWorkerCalls.get(response.id)
    if (!pending) return
    pendingWorkerCalls.delete(response.id)

    if (response.ok) pending.resolve(response.text ?? '')
    else pending.reject(new Error(response.error))
  }

  const rejectAll = (message: string): void => {
    for (const pending of pendingWorkerCalls.values()) pending.reject(new Error(message))
    pendingWorkerCalls.clear()
    worker?.terminate()
    worker = null
    ready = false
  }

  worker.onerror = (event) => rejectAll(event.message || 'The listening worker stopped')
  worker.onmessageerror = () => rejectAll('The listening worker returned unreadable data')
  return worker
}

function callWorker(request: WorkerCommand, transfer: Transferable[] = []): Promise<string> {
  const id = ++nextWorkerCall
  const message = { ...request, id } as WorkerRequest

  return new Promise((resolve, reject) => {
    pendingWorkerCalls.set(id, { resolve, reject })
    listeningWorker().postMessage(message, transfer)
  })
}

/** True once the model is in memory and transcribing will be instant. */
export const modelReady = (): boolean => ready

/**
 * Turn whatever went wrong into something worth reading.
 *
 * This mattered more than it sounds. Every failure used to come out as "Could
 * not download the speech model. Check your connection." — including the ones
 * that had nothing to do with the connection, which sent at least one person
 * off to investigate their Wi-Fi over a content-security-policy rule.
 */
function explainDownload(detail: string): { message: string; hint: string } {
  const all = detail

  if (!navigator.onLine) {
    return {
      message: 'No internet connection',
      hint: 'The model has to be fetched once. Reconnect and try again — after that Vilo listens offline.'
    }
  }

  if (/Content Security Policy|blocked|refused to connect/i.test(all)) {
    return {
      message: 'The download was blocked before it started',
      hint: 'Something between Vilo and huggingface.co is refusing the request — a VPN, a school network, or a content filter are the usual ones.'
    }
  }

  if (/quota|storage|QuotaExceeded|disk/i.test(all)) {
    return {
      message: 'Not enough room to store the model',
      hint: 'Free up a little disk space, or choose the smaller model.'
    }
  }

  if (/404|not found/i.test(all)) {
    return {
      message: 'That model is no longer published',
      hint: 'Try the other size — Vilo will fall back to a different build.'
    }
  }

  if (/cortado|incomplete|truncat/i.test(all)) {
    return {
      message: 'A file arrived incomplete',
      hint: 'It was thrown away rather than kept, so nothing is corrupted. Try again — everything that did arrive is already saved.'
    }
  }

  return {
    message: 'The download paused before it finished',
    hint: 'Resume it. Every verified byte is kept, so it continues instead of starting over.'
  }
}

function explainEngine(detail: string): { message: string; hint: string } {
  if (/memory|allocation|out of bounds/i.test(detail)) {
    return {
      message: 'The listening engine ran out of memory',
      hint: 'Try the Small model. It needs less memory and your downloaded files will stay available.'
    }
  }

  return {
    message: 'The model is installed, but the listening engine could not start',
    hint: `Restart Vilo and try once more. This is not a download error. Technical detail: ${concise(detail)}`
  }
}

function concise(detail: string): string {
  const oneLine = detail.replace(/\s+/g, ' ').trim()
  return oneLine.length > 180 ? `${oneLine.slice(0, 177)}…` : oneLine || 'Unknown engine error'
}

/**
 * Load the model, reporting progress.
 *
 * Concurrent callers share one promise: without this, pressing the button
 * twice would start two downloads of the same model.
 */
export async function loadModel(
  onProgress?: (progress: ModelProgress) => void,
  quality: Quality = savedQuality(),
  options: { repair?: boolean } = {}
): Promise<void> {
  if (ready) return
  if (loading) return loading

  const build = BUILDS[quality]

  loading = (async () => {
    try {
      await installModelBundle(
        bundleForQuality(quality),
        'the listening model',
        (progress) => onProgress?.(progress),
        options.repair ?? false
      )

      /*
       * Model creation and every inference happen in a dedicated module
       * worker. WebAssembly is synchronous inside its own thread, but React,
       * the listening animation, and the rest of the window remain responsive.
       */
      await callWorker({ type: 'load', model: build.model, dtype: build.dtype })
      ready = true
      onProgress?.({ phase: 'ready', percent: 100, message: 'Vilo can hear you' })
    } catch (err) {
      console.error(`[voice] ${build.model} did not load:`, err)
      const download = err instanceof ModelInstallError
      const { message, hint } = download
        ? explainDownload((err as Error).message)
        : explainEngine((err as Error).message)
      onProgress?.({
        phase: 'error',
        percent: 0,
        message,
        hint,
        kind: download ? 'download' : 'engine'
      })
      throw err
    } finally {
      loading = null
    }
  })()

  return loading
}

/** Turn 16 kHz audio into text. Empty string if there was no speech. */
export async function transcribe(audio: Float32Array): Promise<string> {
  const speech = speechSegment(audio)
  if (!speech) return ''

  await loadModel()
  const transferable = new Float32Array(speech.audio).buffer
  const text = await callWorker(
    { type: 'transcribe', audio: transferable },
    [transferable]
  )
  return clean(text)
}

/**
 * Whisper labels silence and noise with tags in brackets or parentheses —
 * things like [Music] or (silence). In an assistant that is not text, it is
 * noise that would get sent to the model as though it were a request.
 */
function clean(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
