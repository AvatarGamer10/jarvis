import type { ChatMessage } from '@shared/types'
import { JsonStore } from '../store/json-store'
import type { ConversationItem } from './provider'

interface ChatData {
  /** Lo que ve el usuario en pantalla. */
  mensajes: ChatMessage[]
  /** Lo que ve el modelo. No es lo mismo: aqui van tambien los resultados de
      las herramientas, que en pantalla se resumen en una linea. */
  contexto: ConversationItem[]
}

/**
 * Cuantos mensajes se guardan en pantalla. Mas que eso no lo lee nadie, y el
 * fichero crece sin freno.
 */
const MAX_MENSAJES = 200

/**
 * Conserva la conversacion entre arranques.
 *
 * Antes vivia solo en memoria: cerrabas JARVIS y desaparecia todo lo hablado,
 * y ademas el asistente no podia recordar nada de un dia para otro.
 *
 * Se guardan dos cosas por separado a proposito. Los mensajes de pantalla y el
 * contexto del modelo divergen: en pantalla una llamada a herramienta es una
 * linea de resumen, mientras que el modelo necesita el resultado completo para
 * seguir el hilo.
 */
export class ChatStore {
  private readonly store: JsonStore<ChatData>

  constructor() {
    this.store = new JsonStore<ChatData>('chat.json', { mensajes: [], contexto: [] })
  }

  mensajes(): ChatMessage[] {
    return this.store.get().mensajes
  }

  contexto(): ConversationItem[] {
    return this.store.get().contexto
  }

  guardar(mensajes: ChatMessage[], contexto: ConversationItem[]): void {
    this.store.set({
      mensajes: mensajes.slice(-MAX_MENSAJES),
      contexto
    })
  }

  vaciar(): void {
    this.store.set({ mensajes: [], contexto: [] })
  }
}
