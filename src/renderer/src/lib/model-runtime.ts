import ortWasmFactoryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'

interface RuntimeEnvironment {
  allowLocalModels: boolean
  useBrowserCache: boolean
  remoteHost: string
  useWasmCache: boolean
  backends: {
    onnx: {
      wasm?: {
        numThreads?: number
        proxy?: boolean
        wasmPaths?: string | { mjs?: string | URL; wasm?: string | URL }
      }
    }
  }
}

/**
 * Point Transformers/ORT at Vilo's verified local model cache and packaged
 * WebAssembly runtime. `proxy` stays off because callers that need isolation
 * run this code inside Vilo's dedicated model worker already.
 */
export function configureModelRuntime(env: RuntimeEnvironment): void {
  env.allowLocalModels = false
  env.useBrowserCache = false
  env.remoteHost = 'vilo://hf/'
  env.useWasmCache = false

  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1
    env.backends.onnx.wasm.proxy = false
    env.backends.onnx.wasm.wasmPaths = {
      mjs: new URL(ortWasmFactoryUrl, import.meta.url).href,
      wasm: new URL(ortWasmBinaryUrl, import.meta.url).href
    }
  }
}
