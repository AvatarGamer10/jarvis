/**
 * FASE 0 - Spike de acceso (bloqueante)
 *
 * Comprueba, ANTES de construir nada, que:
 *   1. Tu cuenta del colegio deja autorizar la app (el admin de Workspace puede bloquearla).
 *   2. Puedes leer tus cursos y tareas de Google Classroom.
 *   3. Puedes leer tu Google Calendar.
 *   4. Tu clave de Gemini funciona.
 *
 * Solo usa modulos nativos de Node: no hace falta `npm install`.
 *
 *   node scripts/spike-google.mjs
 */

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN_FILE = path.join(ROOT, '.jarvis-spike-tokens.json')

// Permisos que pedimos. Principio de minimo privilegio: todo lo de Classroom es
// SOLO LECTURA, porque la API no nos deja entregar tareas de todos modos (ver README).
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
  // drive.file solo da acceso a los ficheros que crea la propia app, no a todo tu Drive.
  'https://www.googleapis.com/auth/drive.file'
]

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
}

const ok = (m) => console.log(`${c.green}  OK${c.reset}  ${m}`)
const fail = (m) => console.log(`${c.red}  FALLO${c.reset}  ${m}`)
const warn = (m) => console.log(`${c.yellow}  AVISO${c.reset}  ${m}`)
const info = (m) => console.log(`${c.dim}        ${m}${c.reset}`)
const title = (m) => console.log(`\n${c.bold}${c.cyan}${m}${c.reset}`)

/** Lee .env sin dependencias externas. */
function loadEnv() {
  const file = path.join(ROOT, '.env')
  if (!fs.existsSync(file)) return {}
  const env = {}
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    // El "" vacio es el titulo de ventana: sin el, start trata la URL como titulo.
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  }
}

const base64url = (buf) => buf.toString('base64url')

/** Llama a una API de Google y devuelve { ok, status, data }. */
async function api(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  return { ok: res.ok, status: res.status, data }
}

/** Explica en cristiano los errores tipicos de Google. */
function explainGoogleError(status, data) {
  const msg = data?.error?.message ?? data?.error_description ?? JSON.stringify(data).slice(0, 300)
  const lines = [msg]
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
    lines.push(
      'La API no esta habilitada en tu proyecto de Google Cloud. Actívala en la consola y espera 1-2 min.'
    )
  } else if (status === 403 && /PERMISSION_DENIED|caller does not have/i.test(msg)) {
    lines.push(
      'Puede ser que el admin del colegio bloquee apps de terceros, o que falte el scope correspondiente.'
    )
  } else if (status === 401) {
    lines.push('Token invalido o caducado. Borra .jarvis-spike-tokens.json y repite el login.')
  } else if (status === 404) {
    lines.push('No encontrado: normalmente significa que esa cuenta no tiene ese recurso.')
  }
  return lines
}

// --------------------------------------------------------------------------
// OAuth 2.0 con PKCE y redireccion a loopback
// --------------------------------------------------------------------------

async function authorize(clientId, clientSecret) {
  const cached = fs.existsSync(TOKEN_FILE)
    ? JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
    : null

  if (cached?.refresh_token) {
    info('Encontrado un refresh token guardado, intentando renovar...')
    const refreshed = await refreshAccessToken(clientId, clientSecret, cached.refresh_token)
    if (refreshed) {
      ok('Sesion renovada sin abrir el navegador.')
      return refreshed.access_token
    }
    warn('El refresh token ya no vale (¿han pasado mas de 7 dias en modo "Testing"?). Repetimos login.')
  }

  const verifier = base64url(crypto.randomBytes(48))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  const state = base64url(crypto.randomBytes(16))

  // Escuchamos en 127.0.0.1 con puerto efimero: el SO nos da uno libre.
  const server = http.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const redirectUri = `http://127.0.0.1:${port}`

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES.join(' '))
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')

  console.log('\nAbriendo el navegador para que inicies sesion.')
  console.log(`${c.dim}Si no se abre solo, copia esta URL:${c.reset}`)
  console.log(`${c.dim}${authUrl}${c.reset}\n`)
  console.log(`${c.yellow}>> Inicia sesion con la CUENTA DEL COLEGIO. Ese es el objetivo de esta prueba.${c.reset}`)
  console.log(`${c.dim}Si ves "Google no ha verificado esta aplicacion", pulsa Configuracion avanzada > Ir a JARVIS.${c.reset}`)

  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Se agoto el tiempo de espera (5 min) sin completar el login.'))
    }, 5 * 60 * 1000)

    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri)
      const returnedCode = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      const reply = (msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:3rem;text-align:center">
           <h2>${msg}</h2><p>Ya puedes cerrar esta pestana y volver a la terminal.</p></body>`
        )
      }

      clearTimeout(timeout)
      if (error) {
        reply('Autorizacion denegada')
        server.close()
        reject(new Error(`Google devolvio error=${error}`))
        return
      }
      // Sin esta comprobacion, un enlace malicioso podria inyectarnos un code ajeno.
      if (returnedState !== state) {
        reply('Error de seguridad (state no coincide)')
        server.close()
        reject(new Error('El parametro state no coincide: posible intento de CSRF.'))
        return
      }
      reply('Listo, JARVIS ya tiene acceso')
      server.close()
      resolve(returnedCode)
    })
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  })
  const tokens = await res.json()
  if (!res.ok) {
    throw new Error(`No se pudo canjear el codigo: ${JSON.stringify(tokens)}`)
  }

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2))
  ok('Login completado y tokens guardados en .jarvis-spike-tokens.json')
  if (!tokens.refresh_token) {
    warn('Google no devolvio refresh_token. Revoca el acceso en myaccount.google.com/permissions y repite.')
  }
  return tokens.access_token
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  if (!res.ok) return null
  return res.json()
}

// --------------------------------------------------------------------------
// Comprobaciones
// --------------------------------------------------------------------------

async function checkClassroom(accessToken, results) {
  title('2. Google Classroom')

  const courses = await api(
    'https://classroom.googleapis.com/v1/courses?studentId=me&courseStates=ACTIVE&pageSize=50',
    accessToken
  )
  if (!courses.ok) {
    fail(`No se pudieron listar los cursos (HTTP ${courses.status}).`)
    explainGoogleError(courses.status, courses.data).forEach(info)
    results.classroom = false
    return
  }

  const list = courses.data.courses ?? []
  if (list.length === 0) {
    warn('La cuenta ha autorizado bien, pero no aparece ningun curso activo como alumno.')
    info('Si es verano o los cursos estan archivados, prueba a quitar courseStates=ACTIVE.')
    results.classroom = true
    return
  }

  ok(`${list.length} curso(s) activo(s) encontrados:`)
  for (const course of list) info(`- ${course.name}${course.section ? ` (${course.section})` : ''}`)

  // Miramos las tareas del primer curso para validar tambien courseWork y submissions.
  const first = list[0]
  const work = await api(
    `https://classroom.googleapis.com/v1/courses/${first.id}/courseWork?pageSize=10`,
    accessToken
  )
  if (!work.ok) {
    fail(`Cursos OK pero no se pueden leer las tareas de "${first.name}" (HTTP ${work.status}).`)
    explainGoogleError(work.status, work.data).forEach(info)
    results.classroom = false
    return
  }

  const items = work.data.courseWork ?? []
  ok(`Lectura de tareas correcta (${items.length} en "${first.name}").`)
  for (const w of items.slice(0, 5)) {
    const d = w.dueDate
    const due = d ? ` [entrega ${d.day}/${d.month}/${d.year}]` : ''
    info(`- ${w.title}${due}`)
  }

  if (items.length > 0) {
    const subs = await api(
      `https://classroom.googleapis.com/v1/courses/${first.id}/courseWork/${items[0].id}/studentSubmissions?userId=me`,
      accessToken
    )
    if (subs.ok) {
      const state = subs.data.studentSubmissions?.[0]?.state ?? 'sin entrega'
      ok(`Lectura del estado de entrega correcta (primera tarea: ${state}).`)
    } else {
      warn(`No se pudo leer el estado de entrega (HTTP ${subs.status}).`)
      explainGoogleError(subs.status, subs.data).forEach(info)
    }
  }

  results.classroom = true
}

async function checkCalendar(accessToken, results) {
  title('3. Google Calendar')

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', new Date().toISOString())
  url.searchParams.set('maxResults', '5')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')

  const res = await api(url.toString(), accessToken)
  if (!res.ok) {
    fail(`No se pudo leer el calendario (HTTP ${res.status}).`)
    explainGoogleError(res.status, res.data).forEach(info)
    results.calendar = false
    return
  }

  const events = res.data.items ?? []
  ok(`Calendario accesible (${events.length} evento(s) proximos).`)
  for (const e of events) {
    const start = e.start?.dateTime ?? e.start?.date ?? '?'
    info(`- ${start}  ${e.summary ?? '(sin titulo)'}`)
  }
  results.calendar = true
}

async function checkGemini(apiKey, model, results) {
  title('4. Gemini')

  if (!apiKey || apiKey.startsWith('xxxx')) {
    fail('Falta GEMINI_API_KEY en .env. Consiguela en https://aistudio.google.com/apikey')
    results.gemini = false
    return
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Responde unicamente con la palabra: funciona' }] }],
        generationConfig: { maxOutputTokens: 20, temperature: 0 }
      })
    }
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    fail(`Gemini devolvio HTTP ${res.status}.`)
    const msg = data?.error?.message ?? JSON.stringify(data).slice(0, 300)
    info(msg)
    if (res.status === 404) info(`¿Existe el modelo "${model}"? Comprueba el nombre exacto en AI Studio.`)
    if (res.status === 429) info('Has agotado la cuota del free tier. Espera o baja el ritmo de llamadas.')
    results.gemini = false
    return
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '(respuesta vacia)'
  ok(`Gemini responde con el modelo "${model}": "${text}"`)
  results.gemini = true
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  console.log(`${c.bold}\n=== JARVIS - Fase 0: spike de acceso ===${c.reset}`)

  const env = { ...loadEnv(), ...process.env }
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash'

  if (!clientId || clientId.startsWith('xxxx')) {
    fail('Falta GOOGLE_CLIENT_ID.')
    info('Copia .env.example a .env y sigue los pasos del README (seccion "Fase 0").')
    process.exit(1)
  }

  const results = { auth: false, classroom: false, calendar: false, gemini: false }

  title('1. Autorizacion OAuth con la cuenta del colegio')
  let accessToken
  try {
    accessToken = await authorize(clientId, clientSecret)
    results.auth = true
  } catch (err) {
    fail(err.message)
    info('Si el error menciona "blocked" o "admin", el colegio tiene bloqueadas las apps de terceros.')
    info('En ese caso hay que hablar con el administrador o replantear el modulo de Classroom.')
    printVerdict(results)
    process.exit(1)
  }

  await checkClassroom(accessToken, results)
  await checkCalendar(accessToken, results)
  await checkGemini(env.GEMINI_API_KEY, model, results)

  printVerdict(results)
  process.exit(Object.values(results).every(Boolean) ? 0 : 1)
}

function printVerdict(r) {
  title('Veredicto')
  const row = (label, value) =>
    console.log(`  ${value ? c.green + 'OK   ' : c.red + 'FALLO'}${c.reset}  ${label}`)
  row('Login con la cuenta del colegio', r.auth)
  row('Lectura de Google Classroom', r.classroom)
  row('Lectura de Google Calendar', r.calendar)
  row('Conexion con Gemini', r.gemini)

  if (Object.values(r).every(Boolean)) {
    console.log(`\n${c.green}${c.bold}Fase 0 superada.${c.reset} Se puede continuar con la Fase 1.\n`)
  } else {
    console.log(
      `\n${c.yellow}${c.bold}Fase 0 no superada.${c.reset} Revisa los fallos de arriba antes de seguir construyendo.\n`
    )
  }
}

main().catch((err) => {
  console.error(`\n${c.red}Error inesperado:${c.reset}`, err)
  process.exit(1)
})
