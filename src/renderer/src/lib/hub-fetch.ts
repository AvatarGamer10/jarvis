/**
 * Everything that asks for huggingface.co gets the local proxy instead.
 *
 * `env.remoteHost` covers transformers.js and nothing else. kokoro-js builds
 * the URL for its voice files by hand:
 *
 *   `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${id}.bin`
 *
 * so those requests went straight out of the renderer, where the content
 * security policy allows `vilo:` and nothing else — every voice would have
 * failed to load, after a 93 MB download that appeared to succeed.
 *
 * Rather than punching a hole in the policy for one library, the rewrite
 * happens here, once, at the only place every request has to pass through.
 * Anything else that hardcodes a hub URL in future is covered for free, and
 * the policy stays as narrow as it was.
 *
 * Nothing but huggingface.co is touched.
 */

const HUB = 'https://huggingface.co/'

export function routeHubThroughProxy(): void {
  const original = globalThis.fetch

  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const href =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    if (!href.startsWith(HUB)) return original(input, init)

    const rerouted = `vilo://hf/${href.slice(HUB.length)}`

    // A Request carries method, headers and body, and they have to survive the
    // change of address — reconstructing it from the URL alone would quietly
    // turn a HEAD into a GET.
    if (typeof input !== 'string' && !(input instanceof URL)) {
      return original(new Request(rerouted, input), init)
    }

    return original(rerouted, init)
  }
}
