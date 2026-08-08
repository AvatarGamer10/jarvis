/// <reference lib="webworker" />

import {
  env,
  pipeline,
  WhisperFeatureExtractor,
  WhisperProcessor,
  WhisperTokenizer,
  type AutomaticSpeechRecognitionPipeline,
  type FeatureExtractor,
  type PreTrainedTokenizer,
  type Processor
} from '@huggingface/transformers'
import { configureModelRuntime } from './model-runtime'

configureModelRuntime(env)

type LoadRequest = {
  id: number
  type: 'load'
  model: string
  dtype: 'q8'
}

type TranscribeRequest = {
  id: number
  type: 'transcribe'
  audio: ArrayBuffer
}

type Request = LoadRequest | TranscribeRequest

type Response =
  | { id: number; ok: true; text?: string }
  | { id: number; ok: false; error: string }

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let englishOnly = false

const modelRoot = (model: string): string => `vilo://hf/${model}/resolve/main/`

async function modelJson(model: string, file: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${modelRoot(model)}${file}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not open ${file} (HTTP ${response.status})`)
  return (await response.json()) as Record<string, unknown>
}

async function load(request: LoadRequest): Promise<void> {
  if (transcriber) return

  const [created, tokenizerJSON, tokenizerConfig, processorConfig] = await Promise.all([
    pipeline('automatic-speech-recognition', request.model, {
      dtype: request.dtype,
      device: 'wasm',
      session_options: { graphOptimizationLevel: 'disabled' }
    }),
    modelJson(request.model, 'tokenizer.json'),
    modelJson(request.model, 'tokenizer_config.json'),
    modelJson(request.model, 'preprocessor_config.json')
  ])

  const Tokenizer = WhisperTokenizer as unknown as new (
    json: Record<string, unknown>,
    config: Record<string, unknown>
  ) => PreTrainedTokenizer
  const Extractor = WhisperFeatureExtractor as unknown as new (
    config: Record<string, unknown>
  ) => FeatureExtractor
  const Whisper = WhisperProcessor as unknown as new (
    config: Record<string, unknown>,
    components: Record<string, object>,
    chatTemplate: string | null
  ) => Processor

  const tokenizer = new Tokenizer(tokenizerJSON, tokenizerConfig)
  const featureExtractor = new Extractor(processorConfig)
  const processor = new Whisper({}, { tokenizer, feature_extractor: featureExtractor }, null)
  created.tokenizer = tokenizer
  created.processor = processor

  transcriber = created as AutomaticSpeechRecognitionPipeline
  englishOnly = request.model.endsWith('.en')
}

async function transcribe(request: TranscribeRequest): Promise<string> {
  if (!transcriber) throw new Error('The listening model is not ready')

  const audio = new Float32Array(request.audio)
  const longUtterance = audio.length > 28 * 16_000
  const output = await transcriber(audio, {
    ...(englishOnly ? {} : { language: 'english', task: 'transcribe' }),
    ...(longUtterance ? { chunk_length_s: 30, stride_length_s: 5 } : {})
  })

  return Array.isArray(output)
    ? output.map((part) => part.text ?? '').join(' ')
    : (output.text ?? '')
}

self.onmessage = (event: MessageEvent<Request>): void => {
  const request = event.data

  void (async () => {
    if (request.type === 'load') {
      await load(request)
      return undefined
    }
    return transcribe(request)
  })()
    .then((text) => self.postMessage({ id: request.id, ok: true, text } satisfies Response))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      self.postMessage({ id: request.id, ok: false, error: message } satisfies Response)
    })
}

export {}
