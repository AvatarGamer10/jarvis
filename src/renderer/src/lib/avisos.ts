/**
 * Avisos flotantes.
 *
 * Antes los mensajes se metian en el flujo de la pagina y empujaban todo hacia
 * abajo: guardabas los ajustes y el boton que acababas de pulsar se movia. Como
 * flotan, no desplazan nada.
 *
 * Ademas es donde vive el "Deshacer". Un boton de deshacer fijo en la interfaz
 * estaria gritando todo el rato por algo que casi nunca se usa; en un aviso que
 * se va solo aparece justo cuando hace falta.
 *
 * Es un emisor a mano y no un contexto de React porque lo llaman funciones
 * asincronas de fuera de los componentes, donde no hay hooks.
 */

export interface AccionAviso {
  etiqueta: string
  ejecutar: () => void | Promise<void>
}

export interface Aviso {
  id: number
  texto: string
  tipo: 'info' | 'error'
  accion?: AccionAviso
}

/**
 * Cuantos se ven a la vez.
 *
 * Borrando ocho tareas seguidas la pila llegaba a ocupar media pantalla y se
 * salia por arriba. Se pierde el "Deshacer" de los mas viejos, pero tapar la
 * aplicacion entera con avisos es peor que perder el de hace cinco borrados.
 */
const MAX_A_LA_VEZ = 3

/** Cuanto dura en pantalla, en milisegundos. */
const DURACION = {
  /** Lo justo para leerlo. */
  info: 4000,
  /** Un error hay que poder leerlo dos veces. */
  error: 8000,
  /** Con boton hace falta tiempo para reaccionar y llegar con el raton. */
  conAccion: 7000
}

type Oyente = (avisos: Aviso[]) => void

class GestorAvisos {
  private lista: Aviso[] = []
  private readonly oyentes = new Set<Oyente>()
  private readonly relojes = new Map<number, ReturnType<typeof setTimeout>>()
  private siguienteId = 1

  subscribir(oyente: Oyente): () => void {
    this.oyentes.add(oyente)
    oyente(this.lista)
    return () => {
      this.oyentes.delete(oyente)
    }
  }

  mostrar(texto: string, opciones: { tipo?: Aviso['tipo']; accion?: AccionAviso } = {}): number {
    const tipo = opciones.tipo ?? 'info'
    const aviso: Aviso = { id: this.siguienteId++, texto, tipo, accion: opciones.accion }

    this.lista = [...this.lista, aviso]
    // Los que sobran se cierran de verdad, no se ocultan: asi tambien se
    // limpian sus temporizadores.
    while (this.lista.length > MAX_A_LA_VEZ) this.cerrar(this.lista[0].id)
    this.avisar()

    const duracion = opciones.accion
      ? DURACION.conAccion
      : tipo === 'error'
        ? DURACION.error
        : DURACION.info

    this.relojes.set(
      aviso.id,
      setTimeout(() => this.cerrar(aviso.id), duracion)
    )

    return aviso.id
  }

  error(texto: string): number {
    return this.mostrar(texto, { tipo: 'error' })
  }

  cerrar(id: number): void {
    const reloj = this.relojes.get(id)
    if (reloj) {
      clearTimeout(reloj)
      this.relojes.delete(id)
    }
    this.lista = this.lista.filter((a) => a.id !== id)
    this.avisar()
  }

  private avisar(): void {
    for (const oyente of this.oyentes) oyente(this.lista)
  }
}

export const avisos = new GestorAvisos()
