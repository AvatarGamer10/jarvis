/**
 * Voz de salida, con las voces que ya trae el sistema operativo.
 *
 * No hace falta descargar nada: Windows y macOS incluyen voces en espanol
 * decentes. Un modelo de sintesis propio pesaria cientos de megas para ganar
 * poco, y aqui la voz acompana a un texto que ya esta en pantalla.
 */

let vozElegida: SpeechSynthesisVoice | null = null
let activada = true

/**
 * Las voces se cargan de forma asincrona en Chromium: la primera llamada a
 * getVoices() suele devolver una lista vacia.
 */
function elegirVoz(): SpeechSynthesisVoice | null {
  const voces = window.speechSynthesis?.getVoices() ?? []
  if (voces.length === 0) return null

  const españolas = voces.filter((v) => v.lang.toLowerCase().startsWith('es'))
  if (españolas.length === 0) return voces[0]

  // Se prefiere es-ES sobre otras variantes, y una voz local sobre una de red:
  // las de red fallan sin internet y meten un retardo notable.
  return (
    españolas.find((v) => v.lang.toLowerCase().startsWith('es-es') && v.localService) ??
    españolas.find((v) => v.localService) ??
    españolas.find((v) => v.lang.toLowerCase().startsWith('es-es')) ??
    españolas[0]
  )
}

export const tts = {
  /** Se llama al arrancar; las voces pueden tardar en estar disponibles. */
  preparar(): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    vozElegida = elegirVoz()
    if (!vozElegida) {
      window.speechSynthesis.addEventListener(
        'voiceschanged',
        () => {
          vozElegida = elegirVoz()
        },
        { once: true }
      )
    }
  },

  disponible(): boolean {
    return typeof window !== 'undefined' && !!window.speechSynthesis
  },

  nombreVoz(): string | null {
    return vozElegida?.name ?? null
  },

  setActivada(valor: boolean): void {
    activada = valor
    if (!valor) window.speechSynthesis?.cancel()
  },

  hablar(texto: string, alTerminar?: () => void): void {
    if (!activada || !this.disponible() || !texto.trim()) {
      alTerminar?.()
      return
    }

    // Cortar lo anterior: encadenar respuestas viejas encima de la nueva es lo
    // que hace que un asistente por voz resulte insoportable.
    window.speechSynthesis.cancel()

    const frase = new SpeechSynthesisUtterance(texto)
    if (!vozElegida) vozElegida = elegirVoz()
    if (vozElegida) frase.voice = vozElegida
    frase.lang = vozElegida?.lang ?? 'es-ES'
    frase.rate = 1.05
    frase.pitch = 1

    frase.onend = () => alTerminar?.()
    frase.onerror = () => alTerminar?.()

    window.speechSynthesis.speak(frase)
  },

  callar(): void {
    window.speechSynthesis?.cancel()
  }
}
