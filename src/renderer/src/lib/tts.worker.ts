/// <reference lib="webworker" />

import { env, PreTrainedTokenizer, StyleTextToSpeech2Model } from '@huggingface/transformers'
import { KokoroTTS } from 'kokoro-js'
import { configureModelRuntime } from './model-runtime'

configureModelRuntime(env)

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const MODEL_ROOT = `vilo://hf/${MODEL}/resolve/main/`

type Request =
  | { id: number; type: 'load' }
  | { id: number; type: 'generate'; text: string; voice: string }

type Response =
  | { id: number; ok: true; audio?: ArrayBuffer; samplingRate?: number }
  | { id: number; ok: false; error: string }

let engine: KokoroTTS | null = null

async function modelJson(file: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${MODEL_ROOT}${file}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not open ${file} (HTTP ${response.status})`)
  return (await response.json()) as Record<string, unknown>
}

async function load(): Promise<KokoroTTS> {
  if (engine) return engine

  const [model, tokenizerJSON, tokenizerConfig] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(MODEL, {
      dtype: 'q8',
      device: 'wasm',
      session_options: { graphOptimizationLevel: 'disabled' }
    }),
    modelJson('tokenizer.json'),
    modelJson('tokenizer_config.json')
  ])

  const Tokenizer = PreTrainedTokenizer as unknown as new (
    json: Record<string, unknown>,
    config: Record<string, unknown>
  ) => PreTrainedTokenizer
  engine = new KokoroTTS(model, new Tokenizer(tokenizerJSON, tokenizerConfig))
  return engine
}

self.onmessage = (event: MessageEvent<Request>): void => {
  const request = event.data

  void (async () => {
    const tts = await load()
    if (request.type === 'load') return null

    const raw = await tts.generate(request.text, {
      voice: request.voice as never,
      speed: 1
    })
    const samples = (Array.isArray(raw.audio) ? raw.audio[0] : raw.audio) as Float32Array
    const audio = new Float32Array(samples).buffer
    return { audio, samplingRate: raw.sampling_rate }
  })()
    .then((generated) => {
      if (!generated) {
        self.postMessage({ id: request.id, ok: true } satisfies Response)
        return
      }

      const response = {
        id: request.id,
        ok: true,
        audio: generated.audio,
        samplingRate: generated.samplingRate
      } satisfies Response
      self.postMessage(response, [generated.audio])
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      self.postMessage({ id: request.id, ok: false, error: message } satisfies Response)
    })
}

export {}
