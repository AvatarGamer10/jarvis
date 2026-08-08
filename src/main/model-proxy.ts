import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { app, BrowserWindow, net, protocol } from 'electron'
import { Channels } from '@shared/ipc'
import type { ModelBundleId, ModelBundleStatus, ModelDownload } from '@shared/types'
import {
  bundleTotal,
  catalogFile,
  modelBundle,
  modelCacheKey,
  parseContentRange,
  pinnedUpstreamPath,
  type ModelFile
} from './model-catalog'

const UPSTREAM = 'https://huggingface.co'
const RENDERER = path.join(__dirname, '../renderer')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.map': 'application/json'
}

/** This must run before Electron becomes ready. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'vilo',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

function carpetaModelos(): string {
  return path.join(app.getPath('userData'), 'models')
}

function destinoModelo(remotePath: string): string {
  return path.join(carpetaModelos(), modelCacheKey(remotePath))
}

function nombreModelo(remotePath: string): string {
  return remotePath.split('/').pop() ?? 'model file'
}

function avisar(progress: ModelDownload): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(Channels.modelProgress, progress)
  }
}

async function tamano(pathname: string): Promise<number> {
  try {
    return (await stat(pathname)).size
  } catch {
    return 0
  }
}

async function ficheroCompleto(remotePath: string, expected?: ModelFile): Promise<boolean> {
  const size = await tamano(destinoModelo(remotePath))
  return size > 0 && (!expected || size === expected.size)
}

async function sha256(pathname: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(pathname)) hash.update(chunk)
  return hash.digest('hex')
}

interface DownloadOptions {
  expected?: ModelFile
  signal?: AbortSignal
  onProgress?: (received: number, total: number) => void
}

type DownloadResult = { path: string } | { status: number }

/** One physical transfer per Hub path, even if two renderer calls arrive together. */
const transfers = new Map<string, Promise<DownloadResult>>()

async function asegurar(remotePath: string, options: DownloadOptions = {}): Promise<DownloadResult> {
  const active = transfers.get(remotePath)
  if (active) return active

  const transfer = descargar(remotePath, options).finally(() => transfers.delete(remotePath))
  transfers.set(remotePath, transfer)
  return transfer
}

/**
 * Downloads one file atomically. Short responses and connection drops keep the
 * `.part` file, so both an automatic retry and the next app launch continue at
 * the exact byte that was safely written.
 */
async function descargar(remotePath: string, options: DownloadOptions): Promise<DownloadResult> {
  await mkdir(carpetaModelos(), { recursive: true })

  const expected = options.expected ?? catalogFile(remotePath)
  const destination = destinoModelo(remotePath)
  const partial = `${destination}.part`
  const name = nombreModelo(remotePath)

  if (await ficheroCompleto(remotePath, expected)) return { path: destination }

  // A final file with the wrong length is never served to ONNX.
  if ((await tamano(destination)) > 0) await rm(destination, { force: true })

  let lastError: unknown = null

  for (let attempt = 1; attempt <= 5; attempt++) {
    if (options.signal?.aborted) throw new Error('Download paused')

    let from = await tamano(partial)
    if (expected && from > expected.size) {
      await rm(partial, { force: true })
      from = 0
    }

    // A previous process may have written the last byte but closed before the
    // atomic rename. Verify it without touching the network.
    if (expected && from === expected.size) {
      if (!expected.sha256 || (await sha256(partial)) === expected.sha256) {
        await rename(partial, destination)
        return { path: destination }
      }
      await rm(partial, { force: true })
      from = 0
    }

    try {
      options.onProgress?.(from, expected?.size ?? 0)

      const response = await net.fetch(`${UPSTREAM}${pinnedUpstreamPath(remotePath)}`, {
        headers: {
          'Accept-Encoding': 'identity',
          ...(from > 0 ? { Range: `bytes=${from}-` } : {})
        },
        signal: options.signal
      })

      if (response.status === 416) {
        await rm(partial, { force: true })
        lastError = new Error(`${name} could not resume; starting that file again`)
        continue
      }

      // Optional files are probed by Transformers.js. It needs the real 404 in
      // order to continue without them, rather than a proxy-generated 502.
      if (response.status >= 400 && response.status < 500) return { status: response.status }
      if (!response.ok && response.status !== 206) {
        throw new Error(`Server returned HTTP ${response.status} for ${name}`)
      }

      const range = response.status === 206
        ? parseContentRange(response.headers.get('content-range'))
        : null

      if (response.status === 206 && (!range || range.start !== from)) {
        await rm(partial, { force: true })
        throw new Error(`${name} returned an invalid resume range`)
      }

      // A server that ignores Range responds 200. In that case it sent the
      // whole file and the partial must be overwritten, never appended.
      const start = response.status === 206 ? from : 0
      const contentLength = Number(response.headers.get('content-length') ?? 0)
      const total = range?.total ?? expected?.size ?? (contentLength > 0 ? start + contentLength : 0)

      if (expected && total > 0 && total !== expected.size) {
        await rm(partial, { force: true })
        throw new Error(`${name} changed on the server; Vilo will not install an unknown version`)
      }

      const body = response.body
      if (!body) throw new Error(`The server returned an empty response for ${name}`)

      let received = start
      let lastNotice = 0
      const input = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
      input.on('data', (chunk: Buffer) => {
        received += chunk.length
        const now = Date.now()
        if (now - lastNotice >= 120) {
          lastNotice = now
          options.onProgress?.(received, total)
        }
      })

      await pipeline(input, createWriteStream(partial, { flags: start > 0 ? 'a' : 'w' }))

      const written = await tamano(partial)
      const wanted = expected?.size ?? total
      if (wanted > 0 && written !== wanted) {
        // Keep a short file for the next Range request; only an overlong file
        // is unusable and must be discarded.
        if (written > wanted) await rm(partial, { force: true })
        throw new Error(`${name} stopped at ${written} of ${wanted} bytes`)
      }

      if (expected?.sha256 && (await sha256(partial)) !== expected.sha256) {
        await rm(partial, { force: true })
        throw new Error(`${name} failed its integrity check`)
      }

      await rename(partial, destination)
      options.onProgress?.(written, written)
      return { path: destination }
    } catch (error) {
      if (options.signal?.aborted) throw new Error('Download paused')
      lastError = error
      console.error(`[models] ${name}, attempt ${attempt}:`, error)
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 600 * attempt))
    }
  }

  throw new Error(
    `Could not download ${name}. ${lastError instanceof Error ? lastError.message : 'Unknown error'}`
  )
}

interface FileState {
  file: ModelFile
  received: number
  complete: boolean
}

async function estadoFicheros(bundleId: ModelBundleId): Promise<FileState[]> {
  const bundle = modelBundle(bundleId)
  return Promise.all(
    bundle.files.map(async (file) => {
      const finalSize = await tamano(destinoModelo(file.path))
      const complete = finalSize === file.size
      const partialSize = complete ? 0 : await tamano(`${destinoModelo(file.path)}.part`)
      return {
        file,
        complete,
        received: complete ? file.size : Math.min(file.size, partialSize)
      }
    })
  )
}

export async function estadoBundle(bundleId: ModelBundleId): Promise<ModelBundleStatus> {
  const bundle = modelBundle(bundleId)
  const files = await estadoFicheros(bundleId)
  return {
    bundle: bundleId,
    installed: files.every((file) => file.complete),
    received: files.reduce((total, file) => total + file.received, 0),
    total: bundleTotal(bundle)
  }
}

const installs = new Map<ModelBundleId, Promise<ModelBundleStatus>>()
const installControllers = new Map<ModelBundleId, AbortController>()

export async function instalarBundle(bundleId: ModelBundleId): Promise<ModelBundleStatus> {
  const active = installs.get(bundleId)
  if (active) return active

  const controller = new AbortController()
  installControllers.set(bundleId, controller)

  const job = (async () => {
    const bundle = modelBundle(bundleId)
    const states = await estadoFicheros(bundleId)
    const total = bundleTotal(bundle)
    const initial = states.reduce((sum, file) => sum + file.received, 0)

    avisar({
      bundle: bundleId,
      phase: 'checking',
      file: '',
      received: initial,
      total,
      fileReceived: 0,
      fileTotal: 0
    })

    if (states.every((file) => file.complete)) {
      const ready = await estadoBundle(bundleId)
      avisar({
        bundle: bundleId,
        phase: 'ready',
        file: '',
        received: total,
        total,
        fileReceived: 0,
        fileTotal: 0
      })
      return ready
    }

    for (const state of states) {
      if (state.complete) continue

      const others = states.reduce(
        (sum, candidate) => sum + (candidate === state ? 0 : candidate.received),
        0
      )

      const result = await asegurar(state.file.path, {
        expected: state.file,
        signal: controller.signal,
        onProgress: (fileReceived, fileTotal) => {
          state.received = Math.min(state.file.size, fileReceived)
          avisar({
            bundle: bundleId,
            phase: 'downloading',
            file: nombreModelo(state.file.path),
            received: Math.min(total, others + state.received),
            total,
            fileReceived,
            fileTotal: fileTotal || state.file.size
          })
        }
      })

      if ('status' in result) {
        throw new Error(`${nombreModelo(state.file.path)} is unavailable (HTTP ${result.status})`)
      }
      state.complete = true
      state.received = state.file.size
    }

    avisar({
      bundle: bundleId,
      phase: 'verifying',
      file: '',
      received: total,
      total,
      fileReceived: 0,
      fileTotal: 0
    })

    const status = await estadoBundle(bundleId)
    if (!status.installed) throw new Error('The downloaded files could not be verified')

    avisar({
      bundle: bundleId,
      phase: 'ready',
      file: '',
      received: total,
      total,
      fileReceived: 0,
      fileTotal: 0
    })
    return status
  })().finally(() => {
    installs.delete(bundleId)
    installControllers.delete(bundleId)
  })

  installs.set(bundleId, job)
  return job
}

export async function cancelarBundle(bundleId: ModelBundleId): Promise<void> {
  installControllers.get(bundleId)?.abort()
  try {
    await installs.get(bundleId)
  } catch {
    // Cancellation rejects the shared install promise by design.
  }
  const status = await estadoBundle(bundleId)
  avisar({
    bundle: bundleId,
    phase: 'cancelled',
    file: '',
    received: status.received,
    total: status.total,
    fileReceived: 0,
    fileTotal: 0
  })
}

export async function repararBundle(bundleId: ModelBundleId): Promise<ModelBundleStatus> {
  await cancelarBundle(bundleId)
  const bundle = modelBundle(bundleId)
  await Promise.all(
    bundle.files.flatMap((file) => [
      rm(destinoModelo(file.path), { force: true }),
      rm(`${destinoModelo(file.path)}.part`, { force: true })
    ])
  )
  return instalarBundle(bundleId)
}

function modelHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Accept-Ranges': 'bytes',
    // The durable copy is the verified main-process cache. A second Chromium
    // cache previously consumed the same disk space and could retain errors.
    'Cache-Control': 'no-store',
    ...extra
  }
}

function localResponse(request: Request, pathname: string, localPath: string, size: number): Response {
  const contentType = MIME[path.extname(pathname).toLowerCase()] ?? 'application/octet-stream'
  if (request.method === 'HEAD') {
    return new Response(null, {
      headers: modelHeaders({ 'Content-Length': String(size), 'Content-Type': contentType })
    })
  }

  const requestedRange = request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/)
  if (requestedRange) {
    const start = Number(requestedRange[1])
    const end = requestedRange[2] ? Math.min(size - 1, Number(requestedRange[2])) : size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: modelHeaders({ 'Content-Range': `bytes */${size}` })
      })
    }
    const stream = Readable.toWeb(createReadStream(localPath, { start, end })) as ReadableStream<Uint8Array>
    return new Response(stream, {
      status: 206,
      headers: modelHeaders({
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Type': contentType
      })
    })
  }

  const stream = Readable.toWeb(createReadStream(localPath)) as ReadableStream<Uint8Array>
  return new Response(stream, {
    headers: modelHeaders({ 'Content-Length': String(size), 'Content-Type': contentType })
  })
}

/** Serves the renderer and the verified model cache from one secure app origin. */
export function registerProtocol(): void {
  protocol.handle('vilo', async (request) => {
    const url = new URL(request.url)

    if (url.hostname === 'hf') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: modelHeaders() })
      const remotePath = decodeURIComponent(url.pathname)

      try {
        // A HEAD probe should not secretly install a hundred-megabyte model.
        // For catalogued files the immutable manifest already knows the answer.
        if (request.method === 'HEAD') {
          const expected = catalogFile(remotePath)
          if (expected) {
            return new Response(null, {
              headers: modelHeaders({
                'Content-Length': String(expected.size),
                'Content-Type': MIME[path.extname(remotePath)] ?? 'application/octet-stream'
              })
            })
          }
        }

        const result = await asegurar(remotePath, { expected: catalogFile(remotePath) })
        if ('status' in result) {
          return new Response(null, { status: result.status, headers: modelHeaders() })
        }

        return localResponse(request, remotePath, result.path, await tamano(result.path))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Model request failed'
        console.error('[models]', message)
        return new Response(message, { status: 502, headers: modelHeaders() })
      }
    }

    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const file = path.join(RENDERER, relative)
    const escaped = path.relative(RENDERER, file).startsWith('..')
    if (escaped) return new Response('Forbidden', { status: 403 })

    try {
      const { size } = await stat(file)
      const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>
      return new Response(stream, {
        headers: {
          'Content-Length': String(size),
          'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/** Bytes occupied by final and resumable model files. */
export async function tamanoModelos(): Promise<number> {
  try {
    const files = await readdir(carpetaModelos())
    const sizes = await Promise.all(files.map((file) => tamano(path.join(carpetaModelos(), file))))
    return sizes.reduce((total, size) => total + size, 0)
  } catch {
    return 0
  }
}

/** Clears all model packages after stopping active transfers. */
export async function borrarModelos(): Promise<void> {
  await Promise.all(
    (['stt-small', 'stt-balanced', 'tts-neural'] as const).map((bundle) => cancelarBundle(bundle))
  )
  await rm(carpetaModelos(), { recursive: true, force: true })
}
