import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

/**
 * Transcripcion de voz con Whisper corriendo dentro de la app.
 *
 * Se ejecuta en WebAssembly (o en la GPU si el equipo la expone via WebGPU),
 * asi que no hace falta compilar binarios nativos ni instalar nada aparte. Y,
 * lo importante, la voz no sale del ordenador: es coherente con que el chat
 * use un modelo local.
 *
 * El precio es que el modelo hay que descargarlo la primera vez.
 */

/**
 * Combinaciones de modelo y precision, en orden de preferencia.
 *
 * No basta con elegir una: onnxruntime falla al abrir la sesion si los pesos
 * cuantizados no son de la generacion que espera, y el error solo aparece al
 * cargar, no al descargar. Paso exactamente eso con Xenova/whisper-base, cuyos
 * pesos q8 son del runtime anterior:
 *
 *   Missing required scale: model.decoder.embed_tokens.weight_merged_0_scale
 *
 * Los repositorios onnx-community estan construidos para el runtime actual.
 * Se prueba de la mas ligera a la mas segura, y la ultima es sin cuantizar:
 * pesa el doble pero no depende de ninguna tabla de escalas.
 *
 * Whisper "base" es el punto dulce para espanol: "tiny" se inventa palabras
 * con acento y "small" pasa de 400 MB para una mejora que no se nota en
 * frases cortas como las que se le dicen a un asistente.
 */
const CANDIDATOS = [
  { modelo: 'onnx-community/whisper-base', dtype: 'q8', aprox: '~80 MB' },
  { modelo: 'onnx-community/whisper-base', dtype: 'fp32', aprox: '~145 MB' },
  { modelo: 'Xenova/whisper-base', dtype: 'fp32', aprox: '~145 MB' }
] as const

// El modelo se guarda en la cache del navegador, dentro de los datos de la
// app: se descarga una vez y sobrevive a los reinicios.
env.allowLocalModels = false
env.useBrowserCache = true

/**
 * Un solo hilo y sin WebGPU, a proposito.
 *
 * onnxruntime elige entre cuatro binarios WebAssembly distintos segun lo que
 * detecte (hilos, WebGPU, JSPI). Los que no van empaquetados intenta bajarlos
 * de un CDN, y la politica de seguridad de la app lo bloquea, asi que fallaria
 * en la version instalada aunque funcione en desarrollo.
 *
 * Fijando la configuracion se usa siempre el mismo binario, que es el que se
 * empaqueta. Se pierde algo de velocidad frente a WebGPU; a cambio, funciona.
 */
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1
  env.backends.onnx.wasm.proxy = false
}

export interface ProgresoModelo {
  fase: 'descargando' | 'listo' | 'error'
  porcentaje: number
  mensaje: string
}

let transcriptor: AutomaticSpeechRecognitionPipeline | null = null
let cargando: Promise<AutomaticSpeechRecognitionPipeline> | null = null

/** True si el modelo ya esta en memoria y transcribir sera inmediato. */
export const modeloListo = (): boolean => transcriptor !== null

/**
 * Carga el modelo, informando del progreso.
 *
 * Las llamadas simultaneas comparten la misma promesa: sin esto, pulsar dos
 * veces el boton arrancaria dos descargas del mismo modelo.
 */
export async function cargarModelo(
  alProgresar?: (progreso: ProgresoModelo) => void
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (transcriptor) return transcriptor
  if (cargando) return cargando

  cargando = (async () => {
    const fallos: string[] = []

    try {
      for (const [indice, candidato] of CANDIDATOS.entries()) {
        try {
          const creado = await pipeline('automatic-speech-recognition', candidato.modelo, {
            dtype: candidato.dtype,
            device: 'wasm',
            progress_callback: (info: { status?: string; progress?: number }) => {
              if (info.status === 'progress' && typeof info.progress === 'number') {
                alProgresar?.({
                  fase: 'descargando',
                  porcentaje: Math.round(info.progress),
                  mensaje:
                    indice === 0
                      ? 'Descargando el modelo de voz'
                      : `Probando otra version del modelo (${candidato.aprox})`
                })
              }
            }
          })

          transcriptor = creado as AutomaticSpeechRecognitionPipeline
          alProgresar?.({ fase: 'listo', porcentaje: 100, mensaje: 'Modelo de voz listo' })
          return transcriptor
        } catch (err) {
          // Se guarda y se sigue: que una combinacion no abra no significa que
          // ninguna vaya a hacerlo.
          console.error(`[voz] ${candidato.modelo} (${candidato.dtype}) no cargo:`, err)
          fallos.push(`${candidato.modelo} ${candidato.dtype}: ${(err as Error).message}`)
        }
      }

      const mensaje = fallos.some((f) => /Missing required scale|create a session/i.test(f))
        ? 'Ninguna version del modelo de voz es compatible con este equipo.'
        : 'No se pudo descargar el modelo de voz. Comprueba tu conexion.'

      alProgresar?.({ fase: 'error', porcentaje: 0, mensaje })
      throw new Error(fallos.join(' | '))
    } finally {
      cargando = null
    }
  })()

  return cargando
}

/** Convierte audio de 16 kHz en texto. Devuelve cadena vacia si no hubo voz. */
export async function transcribir(audio: Float32Array): Promise<string> {
  // Menos de medio segundo no es una frase, es un clic sin querer.
  if (audio.length < 8000) return ''

  const modelo = await cargarModelo()
  const salida = await modelo(audio, {
    language: 'spanish',
    task: 'transcribe',
    // Trocear en fragmentos permite frases largas sin quedarse sin contexto.
    chunk_length_s: 30,
    stride_length_s: 5
  })

  const texto = Array.isArray(salida)
    ? salida.map((s) => s.text ?? '').join(' ')
    : (salida.text ?? '')

  return limpiar(texto)
}

/**
 * Whisper marca los silencios y ruidos con etiquetas entre corchetes o
 * parentesis, del tipo [Musica] o (silencio). En un asistente eso no es texto:
 * es ruido que acabaria enviandose al modelo como si fuera una peticion.
 */
function limpiar(texto: string): string {
  return texto
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
