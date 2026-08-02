import type { CompleteInput, LLMProvider, LlmReply } from '../provider'
import type { UsageCounter } from '../usage'

/**
 * Elige el proveedor en cada llamada, no al arrancar.
 *
 * Asi cambiar de cerebro en Ajustes tiene efecto en el siguiente mensaje, sin
 * reiniciar la app y sin que el bucle del agente sepa que existen varios.
 *
 * El recuento vive aqui y no dentro de cada proveedor: interesa saber cuantas
 * vueltas esta dando el agente sea cual sea el motor, no solo la cuota de uno.
 */
export class ProviderRouter implements LLMProvider {
  readonly id = 'router'

  constructor(
    private readonly pick: () => LLMProvider,
    private readonly usage: UsageCounter
  ) {}

  complete(input: CompleteInput): Promise<LlmReply> {
    this.usage.record()
    return this.pick().complete(input)
  }
}
