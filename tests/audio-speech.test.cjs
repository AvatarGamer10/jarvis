const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { speechSegment } = require(
  path.join(__dirname, '..', 'out', 'test', 'renderer', 'src', 'lib', 'audio-speech.js')
)

const RATE = 16_000

function tone(seconds, amplitude = 0.08, frequency = 180) {
  const audio = new Float32Array(Math.round(seconds * RATE))
  for (let index = 0; index < audio.length; index++) {
    audio[index] = Math.sin((index / RATE) * Math.PI * 2 * frequency) * amplitude
  }
  return audio
}

test('speechSegment rejects digital silence instead of sending it to Whisper', () => {
  assert.equal(speechSegment(new Float32Array(RATE * 2)), null)
})

test('speechSegment rejects one short handling click', () => {
  const audio = new Float32Array(RATE)
  audio[4_000] = 0.9
  assert.equal(speechSegment(audio), null)
})

test('speechSegment keeps sustained quiet speech', () => {
  // A push-to-talk recording naturally contains a short opening gap while the
  // person begins speaking; the adaptive gate uses it to learn the room tone.
  const audio = new Float32Array(RATE)
  audio.set(tone(0.75, 0.025), RATE / 4)
  const segment = speechSegment(audio)
  assert.ok(segment)
  assert.ok(segment.audio.length >= RATE / 2)
  assert.ok(segment.voicedMs >= 120)
})

test('speechSegment trims long silence around speech with a little padding', () => {
  const audio = new Float32Array(RATE * 3)
  audio.set(tone(1), RATE)
  const segment = speechSegment(audio)
  assert.ok(segment)
  assert.ok(segment.audio.length > RATE)
  assert.ok(segment.audio.length < RATE * 1.5)
})
