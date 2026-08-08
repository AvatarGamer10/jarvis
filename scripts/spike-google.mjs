/**
 * PHASE 0 — access spike (blocking)
 *
 * Checks, BEFORE building anything, that:
 *   1. Your school account is allowed to authorise the app (a Workspace admin
 *      can block it).
 *   2. You can read your Google Classroom courses and assignments.
 *   3. You can read your Google Calendar.
 *   4. Your Gemini key works.
 *
 * Uses only Node's built-in modules: no `npm install` needed.
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
const TOKEN_FILE = path.join(ROOT, '.vilo-spike-tokens.json')

// The permissions we ask for. Least privilege: everything Classroom is READ
// ONLY, because the API will not let us submit work anyway (see the README).
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
  // drive.file grants access only to files the app itself creates, not to all of your Drive.
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
const fail = (m) => console.log(`${c.red}  FAIL${c.reset}  ${m}`)
const warn = (m) => console.log(`${c.yellow}  WARN${c.reset}  ${m}`)
const info = (m) => console.log(`${c.dim}        ${m}${c.reset}`)
const title = (m) => console.log(`\n${c.bold}${c.cyan}${m}${c.reset}`)

/** Reads .env with no external dependencies. */
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
    // The empty "" is the window title: without it, start treats the URL as one.
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  }
}

const base64url = (buf) => buf.toString('base64url')

/** Calls a Google API and returns { ok, status, data }. */
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

/** Explains Google's usual errors in plain English. */
function explainGoogleError(status, data) {
  const msg = data?.error?.message ?? data?.error_description ?? JSON.stringify(data).slice(0, 300)
  const lines = [msg]
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
    lines.push(
      'That API is not enabled in your Google Cloud project. Turn it on in the console and wait a minute or two.'
    )
  } else if (status === 403 && /PERMISSION_DENIED|caller does not have/i.test(msg)) {
    lines.push(
      'The school admin may be blocking third-party apps, or the matching scope may be missing.'
    )
  } else if (status === 401) {
    lines.push('Token invalido o caducado. Borra .vilo-spike-tokens.json y repite el login.')
  } else if (status === 404) {
    lines.push('Not found: usually means that account does not have that resource.')
  }
  return lines
}

// --------------------------------------------------------------------------
// OAuth 2.0 with PKCE and a loopback redirect
// --------------------------------------------------------------------------

async function authorize(clientId, clientSecret) {
  const cached = fs.existsSync(TOKEN_FILE)
    ? JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
    : null

  if (cached?.refresh_token) {
    info('Found a stored refresh token; trying to renew it…')
    const refreshed = await refreshAccessToken(clientId, clientSecret, cached.refresh_token)
    if (refreshed) {
      ok('Session renewed without opening the browser.')
      return refreshed.access_token
    }
    warn('The refresh token is no longer valid — more than 7 days in "Testing" mode? Signing in again.')
  }

  const verifier = base64url(crypto.randomBytes(48))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  const state = base64url(crypto.randomBytes(16))

  // Listening on 127.0.0.1 with an ephemeral port: the OS hands us a free one.
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

  console.log('\nOpening the browser so you can sign in.')
  console.log(`${c.dim}If it does not open by itself, copy this URL:${c.reset}`)
  console.log(`${c.dim}${authUrl}${c.reset}\n`)
  console.log(`${c.yellow}>> Sign in with the account you want to test.${c.reset}`)
  console.log(`${c.dim}If you see "Google hasn\u2019t verified this app", press Advanced > Go to Vilo.${c.reset}`)
  console.log(
    `${c.dim}Si sale "Acceso bloqueado: el administrador de tu institucion debe revisar",${c.reset}`
  )
  console.log(
    `${c.dim}that account belongs to a school that has not approved the app: try a personal one.${c.reset}`
  )

  const code = await new Promise((resolve, reject) => {
    // 15 minutos: el flujo de Google tiene varias pantallas (elegir cuenta,
    // the unverified-app warning, the permission list — and five minutes
    // quedaba corto en cuanto te distraias un momento.
    const timeout = setTimeout(
      () => {
        server.close()
        reject(new Error('Timed out after 15 minutes without the sign-in completing.'))
      },
      15 * 60 * 1000
    )

    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri)
      const returnedCode = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      const reply = (msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:3rem;text-align:center">
           <h2>${msg}</h2><p>You can close this tab and go back to the terminal.</p></body>`
        )
      }

      clearTimeout(timeout)
      if (error) {
        reply('Autorizacion denegada')
        server.close()
        reject(new Error(`Google devolvio error=${error}`))
        return
      }
      // Without this check, a malicious link could inject somebody else's code.
      if (returnedState !== state) {
        reply('Error de seguridad (state no coincide)')
        server.close()
        reject(new Error('The state parameter does not match: possible CSRF attempt.'))
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
  ok('Login completado y tokens guardados en .vilo-spike-tokens.json')
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
    fail(`Could not list the courses (HTTP ${courses.status}).`)
    explainGoogleError(courses.status, courses.data).forEach(info)
    results.classroom = false
    return
  }

  const list = courses.data.courses ?? []
  if (list.length === 0) {
    warn('The account authorised fine, but no active course shows up for this student.')
    info('If it is the summer, or the courses are archived, try dropping courseStates=ACTIVE.')
    results.classroom = true
    return
  }

  ok(`${list.length} curso(s) activo(s) encontrados:`)
  for (const course of list) info(`- ${course.name}${course.section ? ` (${course.section})` : ''}`)

  // The first course's work is checked too, to validate courseWork and submissions.
  const first = list[0]
  const work = await api(
    `https://classroom.googleapis.com/v1/courses/${first.id}/courseWork?pageSize=10`,
    accessToken
  )
  if (!work.ok) {
    fail(`Courses fine, but the assignments for "${first.name}" cannot be read (HTTP ${work.status}).`)
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
      const state = subs.data.studentSubmissions?.[0]?.state ?? 'not submitted'
      ok(`Submission state read correctly (first assignment: ${state}).`)
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
    info(`- ${start}  ${e.summary ?? '(untitled)'}`)
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
        contents: [{ role: 'user', parts: [{ text: 'Reply with only the word: working' }] }],
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
    if (res.status === 429) info('The free tier quota is spent. Wait, or slow the call rate down.')
    results.gemini = false
    return
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '(respuesta vacia)'
  ok(`Gemini answers with the model "${model}": "${text}"`)
  results.gemini = true
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  console.log(`${c.bold}\n=== Vilo — Phase 0: access spike ===${c.reset}`)

  const env = { ...loadEnv(), ...process.env }
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash'

  if (!clientId || clientId.startsWith('xxxx')) {
    fail('Falta GOOGLE_CLIENT_ID.')
    info('Copy .env.example to .env and follow the README (the "Phase 0" section).')
    process.exit(1)
  }

  const results = { auth: false, classroom: false, calendar: false, gemini: false }

  title('1. OAuth authorisation with the school account')
  let accessToken
  try {
    accessToken = await authorize(clientId, clientSecret)
    results.auth = true
  } catch (err) {
    fail(err.message)
    info('Si viste "access_not_configured" o "Acceso bloqueado", el centro no ha aprobado la app.')
    info('Only a school super-administrator can fix this. See the README section.')
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
    console.log(`  ${value ? c.green + 'OK  ' : c.red + 'FAIL'}${c.reset}  ${label}`)
  row('Sign-in with the school account', r.auth)
  row('Lectura de Google Classroom', r.classroom)
  row('Lectura de Google Calendar', r.calendar)
  row('Connection to Gemini', r.gemini)

  if (Object.values(r).every(Boolean)) {
    console.log(`\n${c.green}${c.bold}Phase 0 passed.${c.reset} Phase 1 can go ahead.\n`)
  } else {
    console.log(
      `\n${c.yellow}${c.bold}Phase 0 not passed.${c.reset} Look at the failures above before building further.\n`
    )
  }
}

main().catch((err) => {
  console.error(`\n${c.red}Unexpected error:${c.reset}`, err)
  process.exit(1)
})
