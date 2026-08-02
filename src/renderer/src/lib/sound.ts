/**
 * Sonidos de interfaz sintetizados con Web Audio.
 *
 * No hay ficheros de audio: cada sonido son dos o tres osciladores con su
 * envolvente. Pesa cero, no hay que empaquetar nada, y se puede afinar el
 * timbre exacto sin volver a exportar un wav.
 *
 * El vocabulario es corto a proposito. Un sonido por intencion:
 * moverse, confirmar, cancelar, completar, empezar. Si todo suena, nada
 * significa nada.
 */

type Voice = {
  /** Frecuencias por las que pasa el tono, en orden. */
  notes: number[]
  /** Duracion de cada nota en segundos. */
  step: number
  type: OscillatorType
  /** Volumen de pico. Deliberadamente bajo: esto acompana, no interrumpe. */
  gain: number
}

const VOICES = {
  /** Cambiar de seccion. Casi un roce. */
  nav: { notes: [740, 620], step: 0.045, type: 'sine', gain: 0.025 },
  /** Una accion se ha ejecutado. Sube: algo se ha completado hacia delante. */
  confirm: { notes: [587.33, 880], step: 0.07, type: 'sine', gain: 0.045 },
  /** Cancelar. Baja y se apaga. */
  cancel: { notes: [330, 220], step: 0.08, type: 'sine', gain: 0.035 },
  /** Tarea marcada como hecha. Tres notas, la unica pequena celebracion. */
  done: { notes: [659.25, 783.99, 1046.5], step: 0.065, type: 'triangle', gain: 0.04 },
  /** Entrar en la app. Mas larga y grave: se abre algo. */
  start: { notes: [261.63, 392, 523.25], step: 0.14, type: 'sine', gain: 0.05 }
} satisfies Record<string, Voice>

export type SoundName = keyof typeof VOICES

let context: AudioContext | null = null
let master: GainNode | null = null
let enabled = true

/**
 * El contexto se crea en la primera reproduccion, no al cargar.
 *
 * Los navegadores bloquean el audio hasta que hay un gesto del usuario; si lo
 * creamos antes de tiempo nace suspendido y el primer sonido se pierde.
 */
function ensureContext(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined') return null

  if (!context) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null

    context = new Ctor()
    master = context.createGain()
    master.gain.value = 1

    // Un filtro suave arriba quita la aspereza de los osciladores puros y
    // hace que suenen a interfaz y no a pitido de microondas.
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

      // Ataque muy corto y caida exponencial: es lo que separa un "toc"
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
