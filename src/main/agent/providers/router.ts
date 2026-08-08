import type { CompleteInput, LLMProvider, LlmReply } from '../provider'
import type { UsageCounter } from '../usage'

/**
 * Picks the provider on every call, not at start-up.
 *
 * That way switching brain in Settings takes effect on the next message, with
 * no restart, and without the agent loop knowing there is more than one.
 *
 * The counting lives here rather than inside each provider: what matters is
 * how many rounds the agent is doing whatever the engine, not one engine's
 * quota.
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
