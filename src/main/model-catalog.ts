import { createHash } from 'node:crypto'
import type { ModelBundleId } from '@shared/types'

export interface ModelFile {
  /** The path the library asks for. Kept on `main` so its cache sea estable. */
  path: string
  /** The file's exact size at the pinned revision. */
  size: number
  /** The SHA-256 Hugging Face publishes for files stored with Xet/LFS. */
  sha256?: string
}

export interface ModelBundle {
  id: ModelBundleId
  model: string
  revision: string
  files: readonly ModelFile[]
}

const whisperFiles = (
  model: string,
  sizes: {
    config: number
    generation: number
    merges: number
    tokenizer: number
    tokenizerConfig: number
    vocab: number
    encoder: number
    decoder: number
    encoderSha: string
    decoderSha: string
  }
): ModelFile[] => {
  const root = `/${model}/resolve/main/`
  return [
    { path: `${root}added_tokens.json`, size: 34_604 },
    { path: `${root}config.json`, size: sizes.config },
    { path: `${root}generation_config.json`, size: sizes.generation },
    { path: `${root}merges.txt`, size: sizes.merges },
    { path: `${root}normalizer.json`, size: 52_666 },
    { path: `${root}preprocessor_config.json`, size: 339 },
    { path: `${root}special_tokens_map.json`, size: model.endsWith('.en') ? 2_173 : 2_194 },
    { path: `${root}tokenizer.json`, size: sizes.tokenizer },
    { path: `${root}tokenizer_config.json`, size: sizes.tokenizerConfig },
    { path: `${root}vocab.json`, size: sizes.vocab },
    {
      path: `${root}onnx/encoder_model_quantized.onnx`,
      size: sizes.encoder,
      sha256: sizes.encoderSha
    },
    {
      path: `${root}onnx/decoder_model_merged_quantized.onnx`,
      size: sizes.decoder,
      sha256: sizes.decoderSha
    }
  ]
}

const KOKORO = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const KOKORO_ROOT = `/${KOKORO}/resolve/main/`

const kokoroVoice = (id: string, sha256: string): ModelFile => ({
  path: `${KOKORO_ROOT}voices/${id}.bin`,
  size: 522_240,
  sha256
})

/**
 * A release installs an immutable model revision, not whatever `main` happens
 * to point at next month. The request path stays unchanged because that is what
 * Transformers.js and Kokoro generate; `pinnedUpstreamPath` changes only the
 * upstream request made by the main process.
 */
export const MODEL_BUNDLES: Readonly<Record<ModelBundleId, ModelBundle>> = {
  'stt-small': {
    id: 'stt-small',
    model: 'onnx-community/whisper-tiny.en',
    revision: '2575352d61be1bf7225cf8f8b268a4678025fc58',
    files: whisperFiles('onnx-community/whisper-tiny.en', {
      config: 2_197,
      generation: 1_646,
      merges: 456_318,
      tokenizer: 2_405_679,
      tokenizerConfig: 282_662,
      vocab: 999_186,
      encoder: 10_124_993,
      decoder: 30_718_858,
      encoderSha: 'e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25',
      decoderSha: 'c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52'
    })
  },
  'stt-balanced': {
    id: 'stt-balanced',
    model: 'onnx-community/whisper-base',
    revision: '1846881b6b3a3024392c1eea3ad983695bc23925',
    files: whisperFiles('onnx-community/whisper-base', {
      config: 2_243,
      generation: 3_832,
      merges: 493_869,
      tokenizer: 2_480_466,
      tokenizerConfig: 282_682,
      vocab: 1_036_584,
      encoder: 23_201_314,
      decoder: 53_693_315,
      encoderSha: '5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46',
      decoderSha: 'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b'
    })
  },
  'tts-neural': {
    id: 'tts-neural',
    model: KOKORO,
    revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
    files: [
      { path: `${KOKORO_ROOT}config.json`, size: 44 },
      { path: `${KOKORO_ROOT}tokenizer.json`, size: 3_497 },
      {
        path: `${KOKORO_ROOT}tokenizer_config.json`,
        size: 113,
        sha256: 'be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20'
      },
      {
        path: `${KOKORO_ROOT}onnx/model_quantized.onnx`,
        size: 92_361_116,
        sha256: 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478'
      },
      kokoroVoice('af_nicole', 'cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a'),
      kokoroVoice('af_heart', 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b'),
      kokoroVoice('af_bella', 'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b'),
      kokoroVoice('af_sarah', '4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a'),
      kokoroVoice('af_aoede', '4a004c33430762e2461eedb2013fad808ef4ab3121f5300f554476caf58d8361'),
      kokoroVoice('af_sky', '4435255c9744f3f31659e0d714ab7689bf65d9e77ec1cce060f083912614f0b9'),
      kokoroVoice('bf_emma', '669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73'),
      kokoroVoice('bf_isabella', '3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f'),
      kokoroVoice('am_michael', '1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1'),
      kokoroVoice('bm_george', 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc')
    ]
  }
}

export const modelBundle = (id: ModelBundleId): ModelBundle => {
  const bundle = MODEL_BUNDLES[id]
  if (!bundle) throw new Error('Unknown voice model package')
  return bundle
}

export const bundleTotal = (bundle: ModelBundle): number =>
  bundle.files.reduce((total, file) => total + file.size, 0)

/** Nombre opaco y valido en macOS, Windows y Linux. */
export const modelCacheKey = (remotePath: string): string =>
  `v2-${createHash('sha256').update(remotePath).digest('hex').slice(0, 40)}`

export function pinnedUpstreamPath(remotePath: string): string {
  for (const bundle of Object.values(MODEL_BUNDLES)) {
    const prefix = `/${bundle.model}/resolve/main/`
    if (remotePath.startsWith(prefix)) {
      return `${prefix.replace('/main/', `/${bundle.revision}/`)}${remotePath.slice(prefix.length)}`
    }
  }
  return remotePath
}

export interface ContentRange {
  start: number
  end: number
  total: number
}

export function parseContentRange(value: string | null): ContentRange | null {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i)
  if (!match) return null
  const [, start, end, total] = match.map(Number)
  if (start < 0 || end < start || total <= end) return null
  return { start, end, total }
}

export function catalogFile(remotePath: string): ModelFile | undefined {
  for (const bundle of Object.values(MODEL_BUNDLES)) {
    const file = bundle.files.find((candidate) => candidate.path === remotePath)
    if (file) return file
  }
  return undefined
}
