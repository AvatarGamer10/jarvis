/**
 * Microphone capture, handing back audio in the shape Whisper wants: mono,
 * 16 kHz, floating-point samples.
 *
 * It records with MediaRecorder and converts on release, rather than
 * processing sample by sample while you speak. That way the resampling is
 * done by the browser's own native code when it decodes, and nothing is
 * burning CPU during the recording itself — which is precisely when a stutter
 * would be noticed.
 */

/** What Whisper expects. Not negotiable: the model was trained at 16 kHz. */
const SAMPLE_RATE = 16_000

/** How many bars the visualiser has. */
export const BANDS = 13

export interface Recording {
  /**
   * Current loudness, 0 to 1.
   *
   * This is what drives the orb. One number is enough for "how hard is the
   * ring being pushed"; the per-band split below is for anything that wants
   * to look like a spectrum.
   */
  level(): number
  /**
   * Energy per frequency band, 0 to 1.
   *
   * A single number only says "there is sound". Splitting it across
   * frequencies makes the visualiser move differently for every word, and
   * that is what gives the impression it is hearing you and not the room.
   */
  bands(): number[]
  /** Stop, and hand back audio ready to transcribe. */
  stop(): Promise<Float32Array>
  /** Stop and throw it away. */
  cancel(): void
}

export class MicUnavailable extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'MicUnavailable'
  }
}

export async function record(): Promise<Recording> {
  const permission = await window.vilo.app.microphone()
  if (!permission.ok) {
    throw new MicUnavailable(`Could not check microphone access: ${permission.error}`)
  }
  if (!permission.data.granted) {
    throw new MicUnavailable(
      permission.data.status === 'restricted'
        ? 'Microphone access is restricted on this Mac.'
        : 'Vilo does not have microphone access. Enable Vilo in System Settings → Privacy & Security → Microphone.'
    )
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
  } catch (err) {
    const name = (err as Error).name
    if (name === 'NotAllowedError') {
      throw new MicUnavailable(
        'Vilo does not have permission to use the microphone. Check System Settings → Privacy & Security → Microphone.'
      )
    }
    if (name === 'NotFoundError') {
      throw new MicUnavailable('No microphone found.')
    }
    throw new MicUnavailable(`Could not open the microphone: ${(err as Error).message}`)
  }

  // The analyser is only for the visuals; it never touches the recorded audio.
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  // Smooths the jump between frames. Without it the orb jitters.
  analyser.smoothingTimeConstant = 0.72
  source.connect(analyser)
  const samples = new Uint8Array(analyser.frequencyBinCount)
  const spectrum = new Uint8Array(analyser.frequencyBinCount)

  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream)
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.start()

  const releaseAll = (): void => {
    stream.getTracks().forEach((track) => track.stop())
    void context.close()
  }

  return {
    level() {
      analyser.getByteTimeDomainData(samples)
      // Mean deviation from the centre line (128 = silence).
      let total = 0
      for (const sample of samples) total += Math.abs(sample - 128)
      return Math.min(1, total / samples.length / 40)
    },

    bands() {
      analyser.getByteFrequencyData(spectrum)

      // Speech lives in the low and mid range; the top half of the spectrum is
      // near-silent almost always and would leave half the bars flat forever.
      const useful = Math.floor(spectrum.length * 0.55)
      const perBand = Math.floor(useful / BANDS)
      const out: number[] = []

      for (let b = 0; b < BANDS; b++) {
        let total = 0
        for (let i = 0; i < perBand; i++) total += spectrum[b * perBand + i]
        const mean = total / perBand / 255

        // Lift the higher bands: without this only the first few bars move and
        // the visualiser looks broken.
        out.push(Math.min(1, mean * (1 + b * 0.14)))
      }

      return out
    },

    cancel() {
      if (recorder.state !== 'inactive') recorder.stop()
      releaseAll()
    },

    async stop() {
      const audio = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }))
        if (recorder.state !== 'inactive') recorder.stop()
        else resolve(new Blob(chunks))
      })

      releaseAll()

      if (audio.size === 0) return new Float32Array(0)

      // Decode at 16 kHz: the context resamples on its own, in native code.
      const bytes = await audio.arrayBuffer()
      const target = new OfflineAudioContext(1, 1, SAMPLE_RATE)
      const decoded = await target.decodeAudioData(bytes)

      if (decoded.sampleRate === SAMPLE_RATE) {
        return decoded.getChannelData(0)
      }

      // Some builds ignore the context's rate when decoding, so the resample
      // is forced by playing it back through an offline context.
      const resampler = new OfflineAudioContext(
        1,
        Math.ceil(decoded.duration * SAMPLE_RATE || 1),
        SAMPLE_RATE
      )
      const node = resampler.createBufferSource()
      node.buffer = decoded
      node.connect(resampler.destination)
      node.start()
      const result = await resampler.startRendering()
      return result.getChannelData(0)
    }
  }
}
