/** Whisper's sample rate. Kept here so the speech gate is easy to test. */
const SAMPLE_RATE = 16_000

const FRAME_SAMPLES = 320 // 20 ms
const PADDING_SAMPLES = 2_400 // 150 ms around the first and last spoken frame

export interface SpeechSegment {
  audio: Float32Array
  /** Useful in diagnostics without ever retaining or logging the recording. */
  peak: number
  rms: number
  voicedMs: number
}

/**
 * Remove room tone before Whisper sees it, or return null when nobody spoke.
 *
 * Tiny Whisper models are eager to turn silence into short, common words —
 * especially "you". Looking for sustained speech energy is both faster and
 * more honest than deleting that particular word after transcription (where
 * it may have been exactly what the person said).
 *
 * The threshold adapts to the quietest quarter of the recording, so a laptop
 * fan does not count as speech while a quiet microphone still can. Requiring
 * several adjacent frames rejects clicks, a key release, and desk bumps.
 */
export function speechSegment(input: Float32Array): SpeechSegment | null {
  if (input.length < SAMPLE_RATE / 2) return null

  const frameCount = Math.ceil(input.length / FRAME_SAMPLES)
  const frameRms = new Float32Array(frameCount)
  let peak = 0
  let sumSquares = 0

  for (let frame = 0; frame < frameCount; frame++) {
    const from = frame * FRAME_SAMPLES
    const to = Math.min(input.length, from + FRAME_SAMPLES)
    let squares = 0

    for (let index = from; index < to; index++) {
      const value = input[index]
      const absolute = Math.abs(value)
      if (absolute > peak) peak = absolute
      squares += value * value
      sumSquares += value * value
    }

    frameRms[frame] = Math.sqrt(squares / Math.max(1, to - from))
  }

  // A real voice has at least one meaningful peak. This rejects digital
  // silence and very low converter noise before doing any percentile work.
  if (peak < 0.018) return null

  const ordered = Array.from(frameRms).sort((a, b) => a - b)
  // The quietest 15% is enough to capture the small gap naturally left by
  // push-to-talk without mistaking a long utterance (mostly speech) for noise.
  const noiseFloor = ordered[Math.floor((ordered.length - 1) * 0.15)] ?? 0
  const threshold = Math.max(0.004, Math.min(0.02, noiseFloor * 3.2))

  let first = -1
  let last = -1
  let voicedFrames = 0
  let run = 0
  let longestRun = 0

  for (let frame = 0; frame < frameCount; frame++) {
    if (frameRms[frame] >= threshold) {
      first = first < 0 ? frame : first
      last = frame
      voicedFrames++
      run++
      longestRun = Math.max(longestRun, run)
    } else {
      run = 0
    }
  }

  // At least 120 ms overall and 60 ms without a gap. Speech can be quiet,
  // but it is sustained; clicks and handling noise are not.
  if (voicedFrames < 6 || longestRun < 3 || first < 0 || last < 0) return null

  const from = Math.max(0, first * FRAME_SAMPLES - PADDING_SAMPLES)
  const to = Math.min(input.length, (last + 1) * FRAME_SAMPLES + PADDING_SAMPLES)
  const audio = input.slice(from, to)

  // Whisper is unreliable on fragments shorter than half a second even when
  // they contain a sound. Padding above usually gets normal one-word requests
  // over this line without inventing content for a tap.
  if (audio.length < SAMPLE_RATE / 2) return null

  return {
    audio,
    peak,
    rms: Math.sqrt(sumSquares / input.length),
    voicedMs: Math.round((voicedFrames * FRAME_SAMPLES * 1000) / SAMPLE_RATE)
  }
}
