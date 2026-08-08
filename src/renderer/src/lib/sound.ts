/**
 * Interface sounds, synthesised with Web Audio.
 *
 * There are no audio files: each sound is two or three oscillators with an
 * envelope. It weighs nothing, there is nothing to package, and the exact
 * timbre can be tuned without exporting a wav again.
 *
 * The vocabulary is short on purpose. One sound per intention: moving,
 * confirming, cancelling, completing, starting. If everything makes a noise,
 * nothing
 * significa nada.
 */

type Voice = {
  /** The frequencies the tone passes through, in order. */
  notes: number[]
  /** Duracion de cada nota en segundos. */
  step: number
  type: OscillatorType
  /** Volumen de pico. Deliberadamente bajo: esto acompana, no interrumpe. */
  gain: number
}

const VOICES = {
  /** Changing section. Barely a brush. */
  nav: { notes: [740, 620], step: 0.045, type: 'sine', gain: 0.025 },
  /** An action ran. It rises: something moved forwards. */
  confirm: { notes: [587.33, 880], step: 0.07, type: 'sine', gain: 0.045 },
  /** Cancelling. It falls, and fades out. */
  cancel: { notes: [330, 220], step: 0.08, type: 'sine', gain: 0.035 },
  /** A task ticked off. Three notes — the one small celebration. */
  done: { notes: [659.25, 783.99, 1046.5], step: 0.065, type: 'triangle', gain: 0.04 },
  /** Entrar en la app. Mas larga y grave: se abre algo. */
  start: { notes: [261.63, 392, 523.25], step: 0.14, type: 'sine', gain: 0.05 }
} satisfies Record<string, Voice>

export type SoundName = keyof typeof VOICES

let context: AudioContext | null = null
let master: GainNode | null = null
let enabled = true

/**
 * The context is created on the first playback, not on load.
 *
 * Browsers block audio until there has been a user gesture; creating it
 * too early leaves it suspended and the first sound is lost.
 */
function ensureContext(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined') return null

  if (!context) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null

    context = new Ctor()
    master = context.createGain()
    master.gain.value = 1

    // A gentle filter on top takes the harshness off pure oscillators and
    // makes them sound like an interface rather than a microwave.
    const softener = context.createBiquadFilter()
    softener.type = 'lowpass'
    softener.frequency.value = 2600
    softener.Q.value = 0.4

    master.connect(softener)
    softener.connect(context.destination)
  }

  if (context.state === 'suspended') void context.resume()
  return master ? { ctx: context, out: master } : null
}

export const sound = {
  setEnabled(value: boolean): void {
    enabled = value
  },

  isEnabled(): boolean {
    return enabled
  },

  play(name: SoundName): void {
    if (!enabled) return

    const audio = ensureContext()
    if (!audio) return

    const { ctx, out } = audio
    const voice = VOICES[name] as Voice
    const start = ctx.currentTime

    voice.notes.forEach((frequency, index) => {
      const at = start + index * voice.step
      const osc = ctx.createOscillator()
      const env = ctx.createGain()

      osc.type = voice.type
      osc.frequency.setValueAtTime(frequency, at)

      // Very short attack and exponential decay: that is what separates a tap
      // agradable de un "biip" de electrodomestico.
      env.gain.setValueAtTime(0.0001, at)
      env.gain.exponentialRampToValueAtTime(voice.gain, at + 0.008)
      env.gain.exponentialRampToValueAtTime(0.0001, at + voice.step * 1.9)

      osc.connect(env)
      env.connect(out)
      osc.start(at)
      osc.stop(at + voice.step * 2)
    })
  }
}
