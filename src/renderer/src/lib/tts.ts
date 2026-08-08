import {
  neuralPreferred,
  neuralReady,
  savedNeuralVoice,
  speakNeural,
  stopNeural
} from './neural-voice'

/**
 * Vilo's voice, whichever one is in use.
 *
 * There are two engines and this file is the seam between them, so that
 * nothing else in the app has to know which is talking:
 *
 *   neural   Kokoro, running locally. Sounds like a person. Costs a 92 MB
 *            download once, and a moment's thought before each sentence.
 *            See neural-voice.ts.
 *
 *   system   The voices macOS already has. Instant and free, and on a Mac
 *            where nobody has downloaded the good ones it is Samantha, which
 *            is the voice that prompted all of this.
 *
 * The neural one is preferred as soon as it is installed. The system one is
 * what speaks until then, and what anyone can fall back to — an assistant that
 * says nothing at all until a download finishes is worse than one that says it
 * plainly.
 */

const CHOICE = 'vilo.voice.name'

/**
 * Voices worth asking for, best first.
 *
 * The brief was a girl's voice that is realistic, calm and friendly, so this
 * is ordered by how close each one gets to that rather than by how well known
 * it is. The Premium and Enhanced variants are separate voices as far as the
 * system is concerned, with the same first name, and they are a very large
 * step up — hence matching on the base name and preferring whichever variant
 * turns out to be installed.
 *
 * Ava is first because Apple's newer neural voice is the only one on the list
 * nobody mistakes for a robot. Zoe and Allison follow. Serena and Kate are
 * British and read a little more measured, which suits an assistant. Samantha
 * is last of the named ones because she is everywhere, and being everywhere is
 * her only advantage.
 */
const PREFERRED = [
  'ava',
  'zoe',
  'allison',
  'joelle',
  'nicky',
  'serena',
  'kate',
  'stephanie',
  'susan',
  'karen',
  'moira',
  'tessa',
  'samantha'
]

/** Names that are unmistakably not what was asked for. */
const MASCULINE = /daniel|alex|fred|tom|oliver|arthur|rishi|aaron|nathan|evan|lee\b|gordon|jamie/i

/** The ones macOS only ships as novelties. They are not a voice for an app. */
const NOVELTY =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|junior|organ|superstar|trinoids|whisper|wobble|zarvox|ralph|kathy|princess|bruce|agnes|victoria|grandma|grandpa|rocko|sandy|shelley|eddy|flo|reed|sinji/i

export interface VoiceOption {
  name: string
  lang: string
  /** True for the ones we consider a real upgrade, so they can be labelled. */
  premium: boolean
}

/**
 * How fast Vilo talks, as a multiplier on the voice's natural rate.
 *
 * Slightly under one. Default rate reads like a phone menu going through terms
 * and conditions; this is closer to somebody telling you what is on this
 * afternoon.
 */
const RATE = 0.95

/**
 * Words per minute at rate 1.0 for a typical English system voice.
 *
 * Used to pace the caption when the platform does not report word boundaries.
 * The old code guessed 150ms per word — that is 400 words a minute, more than
 * twice as fast as anything actually speaks, so on any voice without boundary
 * events the text finished long before the sentence did. Which is precisely
 * the "it doesn't match what it says" problem.
 */
const NATURAL_WPM = 165

let chosen: SpeechSynthesisVoice | null = null
let enabled = true
let speaking = false

function usable(): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return voices.filter(
    (v) => v.lang.toLowerCase().startsWith('en') && !NOVELTY.test(v.name)
  )
}

const isPremium = (voice: SpeechSynthesisVoice): boolean =>
  /premium|enhanced|neural|siri/i.test(voice.name)

/**
 * Score a voice against the brief. Higher is better.
 *
 * Ranking rather than a hard list of names, because the set of installed
 * voices differs on every machine and a list would leave a Mac with an unusual
 * one falling all the way through to whatever happened to be first.
 */
function score(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase()
  let points = 0

  const rank = PREFERRED.findIndex((wanted) => name.includes(wanted))
  if (rank >= 0) points += (PREFERRED.length - rank) * 10
  else if (MASCULINE.test(name)) points -= 60

  // A downloaded neural variant beats every stock voice on the list.
  if (isPremium(voice)) points += 55

  // Network voices stall for a second before the first word and stop working
  // on a train. Both are worse than a slightly plainer voice.
  if (voice.localService) points += 25

  return points
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = usable()
  if (voices.length === 0) return null

  const remembered = localStorage.getItem(CHOICE)
  if (remembered) {
    const match = voices.find((v) => v.name === remembered)
    if (match) return match
  }

  return [...voices].sort((a, b) => score(b) - score(a))[0]
}

export const tts = {
  /** Called at start-up; the voice list can take a moment to exist. */
  prepare(): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    chosen = pickVoice()
    if (!chosen) {
      // Chromium's first getVoices() is usually empty, and it does not always
      // fire voiceschanged more than once. Listening rather than polling.
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        if (!chosen) chosen = pickVoice()
      })
    }
  },

  available(): boolean {
    return typeof window !== 'undefined' && !!window.speechSynthesis
  },

  /** Everything installed that Vilo would be willing to use, best first. */
  options(): VoiceOption[] {
    return [...usable()]
      .sort((a, b) => score(b) - score(a))
      .map((v) => ({ name: v.name, lang: v.lang, premium: isPremium(v) }))
  },

  voiceName(): string | null {
    return chosen?.name ?? null
  },

  /**
   * True when nothing better than the stock voice is installed.
   *
   * Settings uses it to offer the one-line explanation of where the good ones
   * live, which is somewhere nobody finds by accident.
   */
  couldBeBetter(): boolean {
    return !usable().some(isPremium)
  },

  choose(name: string): void {
    const match = usable().find((v) => v.name === name)
    if (!match) return
    chosen = match
    localStorage.setItem(CHOICE, name)
  },

  setEnabled(value: boolean): void {
    enabled = value
    if (!value) this.stop()
  },

  isSpeaking(): boolean {
    return speaking
  },

  /**
   * Milliseconds per word, for the caption's fallback clock.
   *
   * Only the system engine ever needs this, and only on the platforms that do
   * not report word boundaries. The neural engine has the audio in hand before
   * it plays, so its captions are scheduled against the real duration of the
   * sound and never fall back to an average at all.
   */
  pace(): number {
    return Math.round(60_000 / (NATURAL_WPM * RATE))
  },

  /**
   * Speak, optionally reporting each word boundary as it is reached.
   *
   * `onWord` is what lets the caption under the orb keep pace with the voice
   * instead of guessing at a rate. Not every platform fires boundary events,
   * so callers must still work if it never gets called.
   */
  /** Which engine will actually speak the next sentence. */
  engine(): 'neural' | 'system' {
    return neuralPreferred() && neuralReady() ? 'neural' : 'system'
  },

  speak(
    text: string,
    handlers: { onWord?: (charIndex: number) => void; onEnd?: () => void } = {}
  ): void {
    if (!enabled || !text.trim()) {
      handlers.onEnd?.()
      return
    }

    // The neural voice reports progress in the same units — characters into
    // the original string — so the caption does not care which one answered.
    if (this.engine() === 'neural') {
      speaking = true
      void speakNeural(text, savedNeuralVoice(), {
        onProgress: handlers.onWord,
        onEnd: () => {
          speaking = false
          handlers.onEnd?.()
        }
      }).catch(() => {
        speaking = false
        handlers.onEnd?.()
      })
      return
    }

    if (!this.available()) {
      handlers.onEnd?.()
      return
    }

    // Cut whatever came before. Stacking an old answer on top of a new one is
    // what makes a voice assistant unbearable.
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    if (!chosen) chosen = pickVoice()
    if (chosen) utterance.voice = chosen
    utterance.lang = chosen?.lang ?? 'en-GB'

    utterance.rate = RATE
    // A touch above natural. Softens the voice without tipping into cartoon.
    utterance.pitch = 1.05

    if (handlers.onWord) {
      utterance.onboundary = (event) => {
        if (event.name === 'word' || event.name === undefined) {
          handlers.onWord?.(event.charIndex)
        }
      }
    }

    const done = (): void => {
      speaking = false
      handlers.onEnd?.()
    }

    utterance.onend = done
    utterance.onerror = done

    speaking = true
    window.speechSynthesis.speak(utterance)
  },

  /** A sentence in the currently selected voice, for the settings picker. */
  preview(name?: string): void {
    if (name) this.choose(name)
    const wasEnabled = enabled
    enabled = true
    this.speak('Hi — I am Vilo. This is how I will sound.')
    enabled = wasEnabled
  },

  stop(): void {
    speaking = false
    stopNeural()
    window.speechSynthesis?.cancel()
  }
}
