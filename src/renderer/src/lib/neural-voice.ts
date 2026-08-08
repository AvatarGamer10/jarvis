import type { ModelBundleId } from '@shared/types'
import { installModelBundle, ModelInstallError } from './model-progress'

/**
 * Vilo's real voice.
 *
 * Kokoro — an 82-million-parameter TTS model, Apache-2.0, running here in
 * WebAssembly through the same onnxruntime that already does the listening.
 * Nothing is uploaded, nothing needs an API key, and it sounds like a person
 * rather than like a 2005 screen reader.
 *
 * ## Why this and not Kyutai
 *
 * Pocket TTS is genuinely the better model and it was the right thing to look
 * at. It cannot run here: it is a PyTorch/Rust stack with no ONNX or WebAssembly
 * build, so shipping it would mean bundling a native binary per platform and
 * talking to it over a socket. That is a reasonable thing for Vilo to do one
 * day and a bad thing to do while the app still has an unreliable download on
 * the screen next to it. Kokoro runs in the renderer we already have, today.
 *
 * ## Why the whole reply is not generated at once
 *
 * On one WebAssembly thread this model is somewhere around real time — a
 * ten-second answer takes something like ten seconds to synthesise. Waiting for
 * all of it before any of it plays would put a long silence after every
 * question, which is worse than a plainer voice.
 *
 * So it is done a sentence at a time: the first sentence is synthesised and
 * starts playing while the second is still being made, and each one is queued
 * to begin exactly where the last ended. That also gives the captions something
 * exact to follow — every sentence arrives with its own audio, so its duration
 * is known rather than guessed, and the words on screen are paced by the real
 * length of the sound instead of by an average speaking rate.
 */

/** Voices worth offering, in the order they are offered. */
export interface NeuralVoice {
  id: string
  name: string
  note: string
}

/**
 * Ten, not twenty-eight.
 *
 * Kokoro ships 28 and offering all of them is worse than offering ten: most are
 * near-duplicates nobody can choose between by reading a name, and several are
 * graded poorly by the model's own authors. These are the ones actually worth
 * hearing — softest first, both good British voices, and two male options so
 * the list is not only one kind of voice.
 *
 * They all come from the same weights, so a shorter list costs nothing in
 * download size. It only costs less deciding.
 */
export const NEURAL_VOICES: NeuralVoice[] = [
  { id: 'af_nicole', name: 'Nicole', note: 'Soft and close. The gentlest of them.' },
  { id: 'af_heart', name: 'Heart', note: 'Warm and unhurried. A good default.' },
  { id: 'af_bella', name: 'Bella', note: 'Brighter, with more energy.' },
  { id: 'af_sarah', name: 'Sarah', note: 'Even and matter-of-fact.' },
  { id: 'af_aoede', name: 'Aoede', note: 'Clear and level.' },
  { id: 'af_sky', name: 'Sky', note: 'Light and young.' },
  { id: 'bf_emma', name: 'Emma', note: 'British. Calm and measured.' },
  { id: 'bf_isabella', name: 'Isabella', note: 'British, a little warmer.' },
  { id: 'am_michael', name: 'Michael', note: 'Male, steady.' },
  { id: 'bm_george', name: 'George', note: 'Male, British.' }
]

export const NEURAL_BUNDLE: ModelBundleId = 'tts-neural'

/** 92.4 MB of weights plus the tokeniser and all ten offered offline voices. */
export const NEURAL_MB = 98

const VOICE_KEY = 'vilo.voice.neural'
const ENABLED_KEY = 'vilo.voice.engine'

export interface NeuralProgress {
  phase: 'downloading' | 'preparing' | 'ready' | 'error'
  percent: number
  message: string
  hint?: string
  kind?: 'download' | 'engine'
}

type VoiceWorkerRequest =
  | { id: number; type: 'load' }
  | { id: number; type: 'generate'; text: string; voice: string }

type VoiceWorkerCommand =
  | { type: 'load' }
  | { type: 'generate'; text: string; voice: string }

type VoiceWorkerResponse =
  | { id: number; ok: true; audio?: ArrayBuffer; samplingRate?: number }
  | { id: number; ok: false; error: string }

interface VoiceWorkerResult {
  audio?: Float32Array
  samplingRate?: number
}

interface PendingVoiceCall {
  resolve: (result: VoiceWorkerResult) => void
  reject: (error: Error) => void
}

let engineReady = false
let loading: Promise<void> | null = null
let voiceWorker: Worker | null = null
let nextVoiceCall = 0
const pendingVoiceCalls = new Map<number, PendingVoiceCall>()

/** One context for the whole app; creating them per utterance leaks. */
let audio: AudioContext | null = null
let playing: AudioBufferSourceNode[] = []

/**
 * Cancels the utterance currently being spoken.
 *
 * There are two things to stop and they are not the same: the audio nodes
 * already scheduled, and the timers that will reveal the rest of the caption.
 * Stopping only the first leaves words appearing on screen after the room has
 * gone quiet, which looks far more broken than either failure on its own.
 */
let cancelCurrent: (() => void) | null = null

export const neuralReady = (): boolean => engineReady

export function savedNeuralVoice(): string {
  const saved = localStorage.getItem(VOICE_KEY)
  return NEURAL_VOICES.some((v) => v.id === saved) ? saved! : 'af_nicole'
}

export function rememberNeuralVoice(id: string): void {
  localStorage.setItem(VOICE_KEY, id)
}

/** Whether the user has chosen the neural voice over the system one. */
export function neuralPreferred(): boolean {
  return localStorage.getItem(ENABLED_KEY) !== 'system'
}

export function setNeuralPreferred(on: boolean): void {
  localStorage.setItem(ENABLED_KEY, on ? 'neural' : 'system')
}

/** Whether the one-time speaking choice has been made on the Voice page. */
export function voiceConfigured(): boolean {
  return localStorage.getItem(ENABLED_KEY) !== null
}

function naturalVoiceWorker(): Worker {
  if (voiceWorker) return voiceWorker

  voiceWorker = new Worker(new URL('./tts.worker.ts', import.meta.url), {
    type: 'module',
    name: 'vilo-natural-voice'
  })

  voiceWorker.onmessage = (event: MessageEvent<VoiceWorkerResponse>) => {
    const response = event.data
    const pending = pendingVoiceCalls.get(response.id)
    if (!pending) return
    pendingVoiceCalls.delete(response.id)

    if (!response.ok) {
      pending.reject(new Error(response.error))
      return
    }

    pending.resolve({
      audio: response.audio ? new Float32Array(response.audio) : undefined,
      samplingRate: response.samplingRate
    })
  }

  const rejectAll = (message: string): void => {
    for (const pending of pendingVoiceCalls.values()) pending.reject(new Error(message))
    pendingVoiceCalls.clear()
    voiceWorker?.terminate()
    voiceWorker = null
    engineReady = false
  }

  voiceWorker.onerror = (event) => rejectAll(event.message || 'The natural voice worker stopped')
  voiceWorker.onmessageerror = () => rejectAll('The natural voice worker returned unreadable data')
  return voiceWorker
}

function callVoiceWorker(
  request: VoiceWorkerCommand
): Promise<VoiceWorkerResult> {
  const id = ++nextVoiceCall
  const message = { ...request, id } as VoiceWorkerRequest

  return new Promise((resolve, reject) => {
    pendingVoiceCalls.set(id, { resolve, reject })
    naturalVoiceWorker().postMessage(message)
  })
}

/**
 * Download and open the model.
 *
 * Same shape as the speech-recognition loader, and for the same reasons — see
 * the long note in stt.ts about why `done` events cannot be trusted to mean the
 * download has finished, and why a dropped connection has to retry the same
 * source rather than fall through to a different one.
 */
export async function loadNeuralVoice(
  onProgress?: (progress: NeuralProgress) => void,
  options: { repair?: boolean } = {}
): Promise<void> {
  if (engineReady) return
  if (loading) return loading

  loading = (async () => {
    try {
      await installModelBundle(
        NEURAL_BUNDLE,
        'the natural voice',
        (progress) => onProgress?.(progress),
        options.repair ?? false
      )

      onProgress?.({
        phase: 'preparing',
        percent: 100,
        message: 'Starting the natural voice…'
      })

      /*
       * Opening the 98 MB model is real work, but it no longer runs in React's
       * thread. Preparing it here means the first answer does not pay that cost
       * and the rest of Vilo remains interactive while it becomes ready.
       */
      await callVoiceWorker({ type: 'load' })
      engineReady = true
      onProgress?.({ phase: 'ready', percent: 100, message: 'Voice ready' })
    } catch (err) {
      console.error('[voice] Kokoro did not load:', err)
      const download = err instanceof ModelInstallError
      const detail = err instanceof Error ? err.message : String(err)
      onProgress?.({
        phase: 'error',
        percent: 0,
        kind: download ? 'download' : 'engine',
        message: download
          ? navigator.onLine
            ? 'The voice download paused before it finished'
            : 'No internet connection'
          : 'The voice is installed, but its speech engine could not start',
        hint: download
          ? navigator.onLine
            ? 'Resume it. Every verified byte is kept, so it continues from here.'
            : 'Reconnect and resume. Once installed, Vilo speaks offline.'
          : `Use the built-in voice now, or restart Vilo and try once more. This is not a download error. Technical detail: ${concise(detail)}`
      })
      throw err
    } finally {
      if (!engineReady) loading = null
    }
  })()

  try {
    return await loading
  } finally {
    if (engineReady) loading = null
  }
}

function concise(detail: string): string {
  const oneLine = detail.replace(/\s+/g, ' ').trim()
  return oneLine.length > 180 ? `${oneLine.slice(0, 177)}…` : oneLine || 'Unknown engine error'
}

/**
 * Split a reply into things worth synthesising separately.
 *
 * Sentence boundaries, with short ones glued to the next — generating "Yes."
 * on its own costs a whole model run for four hundred milliseconds of audio,
 * and the gap while the next one is made is audible.
 */
function sentences(text: string): string[] {
  const parts = text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [text]
  const out: string[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const previous = out[out.length - 1]
    if (previous && previous.length < 40) out[out.length - 1] = `${previous} ${trimmed}`
    else out.push(trimmed)
  }

  return out.length > 0 ? out : [text]
}

export interface SpeakHandlers {
  /**
   * Characters of the original text spoken so far.
   *
   * The same contract the system voice reports through its boundary events, so
   * the caption component does not need to know which engine is talking.
   */
  onProgress?: (charIndex: number) => void
  onEnd?: () => void
}

/** Stop everything queued and playing, and the caption with it. */
export function stopNeural(): void {
  cancelCurrent?.()
  cancelCurrent = null

  for (const node of playing) {
    try {
      node.onended = null
      node.stop()
    } catch {
      // Already finished. Stopping a stopped node throws and means nothing.
    }
  }
  playing = []
}

/**
 * Say it.
 *
 * Each sentence is synthesised, queued to start where the previous one ends,
 * and its words are revealed across exactly its own duration. Because the audio
 * is in hand before it plays, the caption is driven by the real length of the
 * sound — the text and the voice cannot drift apart.
 */
export async function speakNeural(
  text: string,
  voiceId: string,
  handlers: SpeakHandlers = {}
): Promise<void> {
  await loadNeuralVoice()
  stopNeural()

  audio ??= new AudioContext()
  if (audio.state === 'suspended') await audio.resume()

  const chunks = sentences(text)
  // Where each sentence starts in the original string, so the caption can be
  // reported in the same units the system voice uses.
  let cursor = 0
  const offsets = chunks.map((chunk) => {
    const at = text.indexOf(chunk, cursor)
    cursor = at >= 0 ? at + chunk.length : cursor
    return at >= 0 ? at : cursor
  })

  // A beat of headroom so the first sentence does not start mid-schedule.
  let startAt = audio.currentTime + 0.06
  const cancelled = { value: false }
  const timers: number[] = []

  cancelCurrent = () => {
    cancelled.value = true
    timers.forEach((timer) => window.clearTimeout(timer))
  }

  for (let index = 0; index < chunks.length; index++) {
    if (cancelled.value) break

    let raw: VoiceWorkerResult
    try {
      raw = await callVoiceWorker({
        type: 'generate',
        text: chunks[index],
        voice: voiceId
      })
    } catch (err) {
      console.error('[voice] could not synthesise:', err)
      break
    }

    if (cancelled.value) break

    /*
     * Mono, always.
     *
     * RawAudio's `audio` is typed as either one Float32Array or an array of
     * them, because the type covers multi-channel output too. Kokoro only ever
     * produces one channel, and the narrowing here is what says so.
     */
    const samples = raw.audio
    const samplingRate = raw.samplingRate
    if (!samples || !samplingRate) throw new Error('The natural voice returned no audio')

    const buffer = audio.createBuffer(1, samples.length, samplingRate)
    // Copied rather than handed over: the model's array is typed against
    // ArrayBufferLike (it could in principle be shared memory) and WebAudio
    // will only take a plain one.
    buffer.getChannelData(0).set(samples)

    const node = audio.createBufferSource()
    node.buffer = buffer
    node.connect(audio.destination)

    // If synthesis fell behind playback, start now rather than in the past.
    const begin = Math.max(startAt, audio.currentTime)
    node.start(begin)
    playing.push(node)

    /*
     * The caption for this sentence.
     *
     * One timer per word, scheduled against the real duration of the audio
     * that is about to play. This is the part that makes the text match the
     * voice: nothing here is an estimate of how fast speech is.
     */
    const duration = buffer.duration
    const lead = (begin - audio.currentTime) * 1000

    // Every word with its real offset inside the sentence, found by walking
    // the string rather than by searching for the word — the same word appears
    // twice in a sentence often enough ("the maths and the history") that
    // indexOf would report the first one every time.
    const words: number[] = []
    const pattern = /\S+/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(chunks[index])) !== null) words.push(match.index)

    words.forEach((offsetInChunk, position) => {
      const at = lead + (duration * 1000 * position) / Math.max(1, words.length)
      const charIndex = offsets[index] + offsetInChunk
      timers.push(
        window.setTimeout(() => {
          if (!cancelled.value) handlers.onProgress?.(charIndex)
        }, at)
      )
    })

    startAt = begin + duration

    if (index === chunks.length - 1) {
      node.onended = () => {
        if (!cancelled.value) handlers.onEnd?.()
      }
    }
  }

  if (chunks.length === 0) handlers.onEnd?.()
}
