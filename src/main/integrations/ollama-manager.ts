import type { SettingsService } from '../store/settings'

/**
 * Descarga de modelos de Ollama desde dentro de la app.
 *
 * Existe para quitar de en medio el paso que mas gente pierde: abrir una
 * terminal y escribir `ollama pull`. La API de Ollama devuelve el progreso en
 * streaming, asi que se puede ensenar una barra en vez de un texto quieto.
 */

/** Modelos recomendados, con su peso real y para quien es cada uno. */
export const MODELOS_RECOMENDADOS = [
  {
    nombre: 'llama3.1:8b',
    etiqueta: 'Equilibrado',
    gigas: 4.7,
    descripcion: 'La mejor opcion si tu ordenador tiene 16 GB de memoria o mas.',
    memoriaMinimaGb: 16
  },
  {
    nombre: 'qwen2.5:7b',
    etiqueta: 'Mejor en espanol',
    gigas: 4.7,
    descripcion: 'Entiende mejor el espanol, y pide lo mismo que el anterior.',
    memoriaMinimaGb: 16
  },
  {
    nombre: 'llama3.2:3b',
    etiqueta: 'Ligero',
    gigas: 2,
    descripcion: 'Para portatiles con 8 GB. Responde mas rapido, se equivoca algo mas.',
    memoriaMinimaGb: 8
  }
] as const

export interface ProgresoDescarga {
  modelo: string
  /** Fase en cristiano: "Preparando", "Descargando"... */
  fase: string
  porcentaje: number
  /** Bytes ya descargados, para poder ensenar "1,2 de 4,7 GB". */
  descargado: number
  total: number
  terminado: boolean
  error?: string
}

interface LineaOllama {
  status?: string
  completed?: number
  total?: number
  error?: string
}

/** Traduce los estados de Ollama, que vienen en ingles y en jerga. */
function traducirFase(status: string | undefined): string {
  if (!status) return 'Preparando'
  if (status.includes('manifest')) return 'Preparando'
  if (status.startsWith('pulling')) return 'Descargando'
  if (status.includes('verifying')) return 'Comprobando'
  if (status.includes('writing') || status.includes('extracting')) return 'Instalando'
  if (status === 'success') return 'Listo'
  return 'Descargando'
}

export class OllamaManager {
  private cancelar: AbortController | null = null

  constructor(private readonly settings: SettingsService) {}

  private host(): string {
    return this.settings.all().ollamaHost
  }

  /** True si Ollama responde. Se usa para detectar cuando lo acaban de instalar. */
  async estaFuncionando(): Promise<boolean> {
    try {
      const res = await fetch(new URL('/api/tags', this.host()).toString(), {
        signal: AbortSignal.timeout(2500)
      })
      return res.ok
    } catch {
      return false
    }
  }

  async modelos(): Promise<string[]> {
    try {
      const res = await fetch(new URL('/api/tags', this.host()).toString())
      if (!res.ok) return []
      const data = (await res.json()) as { models?: { name: string }[] }
      return (data.models ?? []).map((m) => m.name)
    } catch {
      return []
    }
  }

  cancelarDescarga(): void {
    this.cancelar?.abort()
    this.cancelar = null
  }

  /**
   * Descarga un modelo informando del progreso.
   *
   * Ollama responde con una linea JSON por evento, no con un JSON entero, asi
   * que se va leyendo el flujo y partiendo por saltos de linea. Un trozo puede
   * cortar una linea por la mitad, por eso se guarda el resto para la vuelta
   * siguiente.
   */
  async descargarModelo(
    modelo: string,
    alProgresar: (progreso: ProgresoDescarga) => void
  ): Promise<void> {
    this.cancelarDescarga()
    this.cancelar = new AbortController()

    const emitir = (parcial: Partial<ProgresoDescarga>): void =>
      alProgresar({
        modelo,
        fase: 'Preparando',
        porcentaje: 0,
        descargado: 0,
        total: 0,
        terminado: false,
        ...parcial
      })

    let res: Response
    try {
      res = await fetch(new URL('/api/pull', this.host()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelo, stream: true }),
        signal: this.cancelar.signal
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      emitir({ terminado: true, error: 'No se puede conectar con Ollama. ¿Esta abierto?' })
      return
    }

    if (!res.ok || !res.body) {
      emitir({
        terminado: true,
        error:
          res.status === 404
            ? `Ollama no conoce el modelo "${modelo}".`
            : `Ollama devolvio un error (${res.status}).`
      })
      return
    }

    const lector = res.body.getReader()
    const decodificador = new TextDecoder()
    let resto = ''

    try {
      for (;;) {
        const { done, value } = await lector.read()
        if (done) break

        resto += decodificador.decode(value, { stream: true })
        const lineas = resto.split('\n')
        // La ultima puede estar cortada a medias: se guarda para la proxima.
        resto = lineas.pop() ?? ''

        for (const linea of lineas) {
          if (!linea.trim()) continue

          let evento: LineaOllama
          try {
            evento = JSON.parse(linea) as LineaOllama
          } catch {
            continue
          }

          if (evento.error) {
            emitir({ terminado: true, error: evento.error })
            return
          }

          const total = evento.total ?? 0
          const completado = evento.completed ?? 0
          emitir({
            fase: traducirFase(evento.status),
            porcentaje: total > 0 ? Math.round((completado / total) * 100) : 0,
            descargado: completado,
            total
          })

          if (evento.status === 'success') {
            // Se deja elegido: quien acaba de descargarlo lo quiere usar.
            this.settings.update({ ollamaModel: modelo })
            emitir({ fase: 'Listo', porcentaje: 100, terminado: true })
            return
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      emitir({ terminado: true, error: (err as Error).message })
    } finally {
      this.cancelar = null
    }
  }
}
