const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const {
  MODEL_BUNDLES,
  bundleTotal,
  modelCacheKey,
  parseContentRange,
  pinnedUpstreamPath
} = require(path.join(__dirname, '..', 'out', 'test', 'main', 'model-catalog.js'))

test('every package has unique files with positive exact sizes', () => {
  for (const bundle of Object.values(MODEL_BUNDLES)) {
    assert.ok(bundle.revision.match(/^[a-f0-9]{40}$/))
    assert.ok(bundle.files.length > 0)
    assert.equal(new Set(bundle.files.map((file) => file.path)).size, bundle.files.length)
    assert.ok(bundle.files.every((file) => file.size > 0))
    assert.equal(bundleTotal(bundle), bundle.files.reduce((sum, file) => sum + file.size, 0))
  }
})

test('the natural voice package includes every voice shown in Settings', () => {
  const paths = MODEL_BUNDLES['tts-neural'].files.map((file) => file.path)
  for (const voice of [
    'af_nicole',
    'af_heart',
    'af_bella',
    'af_sarah',
    'af_aoede',
    'af_sky',
    'bf_emma',
    'bf_isabella',
    'am_michael',
    'bm_george'
  ]) {
    assert.ok(paths.some((file) => file.endsWith(`/voices/${voice}.bin`)))
  }
})

test('the natural voice package includes the tokenizer metadata its runtime requires', () => {
  const tokenizerConfig = MODEL_BUNDLES['tts-neural'].files.find((file) =>
    file.path.endsWith('/tokenizer_config.json')
  )
  assert.deepEqual(tokenizerConfig, {
    path: '/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/tokenizer_config.json',
    size: 113,
    sha256: 'be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20'
  })
})

test('each listening package includes its offline tokenizer and audio processor', () => {
  for (const bundleName of ['stt-small', 'stt-balanced']) {
    const paths = MODEL_BUNDLES[bundleName].files.map((file) => file.path)
    for (const required of [
      '/tokenizer.json',
      '/tokenizer_config.json',
      '/preprocessor_config.json'
    ]) {
      assert.ok(paths.some((file) => file.endsWith(required)), `${bundleName} is missing ${required}`)
    }
  }
})

test('cache names are deterministic and safe on Windows', () => {
  const remote = '/onnx-community/whisper-base/resolve/main/onnx/model.onnx'
  assert.equal(modelCacheKey(remote), modelCacheKey(remote))
  assert.match(modelCacheKey(remote), /^v2-[a-f0-9]{40}$/)
  assert.doesNotMatch(modelCacheKey(remote), /[<>:"/\\|?*]/)
})

test('known model requests are rewritten to the release-pinned revision', () => {
  const request = '/onnx-community/whisper-base/resolve/main/config.json'
  assert.equal(
    pinnedUpstreamPath(request),
    '/onnx-community/whisper-base/resolve/1846881b6b3a3024392c1eea3ad983695bc23925/config.json'
  )
})

test('unknown Hub paths remain untouched for optional library probes', () => {
  const request = '/another/model/resolve/main/config.json'
  assert.equal(pinnedUpstreamPath(request), request)
})

test('content-range parser accepts valid resume metadata', () => {
  assert.deepEqual(parseContentRange('bytes 47096210-92361115/92361116'), {
    start: 47096210,
    end: 92361115,
    total: 92361116
  })
})

test('content-range parser rejects missing, wildcard, and impossible ranges', () => {
  assert.equal(parseContentRange(null), null)
  assert.equal(parseContentRange('bytes 4-9/*'), null)
  assert.equal(parseContentRange('bytes 10-9/20'), null)
  assert.equal(parseContentRange('bytes 0-20/20'), null)
})
