/**
 * Captura del microfono, dejando el audio en el formato que pide Whisper:
 * mono, 16 kHz y muestras en coma flotante.
 *
 * Se graba con MediaRecorder y se convierte al soltar, en vez de procesar
 * muestra a muestra en vivo. Asi el remuestreo lo hace el propio navegador al
 * decodificar, que es codigo nativo y no gasta CPU durante la grabacion, que
 * es justo cuando conviene no dar tirones.
 */

/** Lo que espera Whisper. No es negociable: el modelo se entreno a 16 kHz. */
const FRECUENCIA = 16_000

export interface Grabacion {
  /** Nivel de sonido actual, de 0 a 1, para pintar el indicador. */
  nivel(): number
  /** Detiene y devuelve el audio listo para transcribir. */
  detener(): Promise<Float32Array>
  /** Corta sin devolver nada. */
  cancelar(): void
}

export class MicrofonoNoDisponible extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'MicrofonoNoDisponible'
  }
}

export async function grabar(): Promise<Grabacion> {
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
    const nombre = (err as Error).name
    if (nombre === 'NotAllowedError') {
      throw new MicrofonoNoDisponible(
        'No has dado permiso para usar el microfono. Revisa los ajustes de privacidad del sistema.'
      )
    }
    if (nombre === 'NotFoundError') {
      throw new MicrofonoNoDisponible('No encuentro ningun microfono conectado.')
    }
    throw new MicrofonoNoDisponible(`No se pudo abrir el microfono: ${(err as Error).message}`)
  }

  // Analizador solo para el indicador visual; no toca el audio que se graba.
  const contexto = new AudioContext()
  const fuente = contexto.createMediaStreamSource(stream)
  const analizador = contexto.createAnalyser()
  analizador.fftSize = 512
  fuente.connect(analizador)
  const muestras = new Uint8Array(analizador.frequencyBinCount)

  const trozos: Blob[] = []
  const grabadora = new MediaRecorder(stream)
  grabadora.ondataavailable = (e) => {
    if (e.data.size > 0) trozos.push(e.data)
  }
  grabadora.start()

  const soltarTodo = (): void => {
    stream.getTracks().forEach((t) => t.stop())
    void contexto.close()
  }

  return {
    nivel() {
      analizador.getByteTimeDomainData(muestras)
      // Media de la desviacion respecto al centro (128 = silencio).
      let suma = 0
      for (const m of muestras) suma += Math.abs(m - 128)
      return Math.min(1, suma / muestras.length / 40)
    },

    cancelar() {
      if (grabadora.state !== 'inactive') grabadora.stop()
      soltarTodo()
    },

    async detener() {
      const audio = await new Promise<Blob>((resolve) => {
        grabadora.onstop = () => resolve(new Blob(trozos, { type: grabadora.mimeType }))
        if (grabadora.state !== 'inactive') grabadora.stop()
        else resolve(new Blob(trozos))
      })

      soltarTodo()

      if (audio.size === 0) return new Float32Array(0)

      // Decodificar a 16 kHz: el contexto remuestrea solo, en codigo nativo.
      const bytes = await audio.arrayBuffer()
      const destino = new OfflineAudioContext(1, 1, FRECUENCIA)
      const decodificado = await destino.decodeAudioData(bytes)

      if (decodificado.sampleRate === FRECUENCIA) {
        return decodificado.getChannelData(0)
      }

      // Algunos navegadores ignoran la frecuencia del contexto al decodificar,
      // asi que se fuerza el remuestreo reproduciendolo en uno offline.
      const remuestreador = new OfflineAudioContext(
        1,
        Math.ceil((decodificado.duration * FRECUENCIA) || 1),
        FRECUENCIA
      )
      const nodo = remuestreador.createBufferSource()
      nodo.buffer = decodificado
      nodo.connect(remuestreador.destination)
      nodo.start()
      const resultado = await remuestreador.startRendering()
      return resultado.getChannelData(0)
    }
  }
}
