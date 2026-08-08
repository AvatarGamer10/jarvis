/**
 * Tests for the parser that reads text pasted out of Classroom.
 *
 * This is the route that works with no model, so it has to get ordinary lists
 * right on its own. And getting a date wrong here is worse than not finding
 * one: a deadline placed on the wrong day slips into the brief and into the
 * planner without anybody noticing.
 *
 * The input fixtures stay in Spanish on purpose — that is the language of the
 * Classroom pages this parser exists to read, and translating them would be
 * testing something the parser never sees.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { findDate, parseText } = require(
  path.join(__dirname, '..', 'out', 'test', 'main', 'tasks', 'paste-core.js')
)

// Friday 7 August 2026. Fixed, so the tests do not depend on the day they run.
const TODAY = new Date(2026, 7, 7, 12, 0)

/** "YYYY-MM-DD" in local time, so comparisons do not fight the time zone. */
const day = (iso) => {
  if (iso === null) return null
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

const read = (text) => parseText(text, TODAY)

// --- findDate --------------------------------------------------------------

test('findDate: day and abbreviated month', () => {
  const r = findDate('Fecha de entrega: 10 ago', TODAY)
  assert.equal(day(r.date.toISOString()), '2026-08-10')
  assert.equal(r.rest, '')
})

test('findDate: day and full month', () => {
  const r = findDate('Entrega el 12 de septiembre', TODAY)
  assert.equal(day(r.date.toISOString()), '2026-09-12')
})

test('findDate: slash format', () => {
  assert.equal(day(findDate('15/09/2026', TODAY).date.toISOString()), '2026-09-15')
})

test('findDate: slashes with a two-digit year', () => {
  assert.equal(day(findDate('15/09/26', TODAY).date.toISOString()), '2026-09-15')
})

test('findDate: with no year, the long form beats the slash form', () => {
  // "8/8" also matches inside "8 de agosto de 2026"; if the slash pattern won,
  // the year would be lost.
  const r = findDate('8 de agosto de 2027', TODAY)
  assert.equal(day(r.date.toISOString()), '2027-08-08')
})

test('findDate: today and tomorrow', () => {
  assert.equal(day(findDate('hoy', TODAY).date.toISOString()), '2026-08-07')
  assert.equal(day(findDate('Fecha de entrega: manana', TODAY).date.toISOString()), '2026-08-08')
})

test('findDate: accepts accents', () => {
  assert.equal(day(findDate('mañana', TODAY).date.toISOString()), '2026-08-08')
})

test('findDate: a weekday always points forwards', () => {
  // Today is Friday: the coming Monday is the 10th, not the one just gone.
  assert.equal(day(findDate('para el lunes', TODAY).date.toISOString()), '2026-08-10')
})

test('findDate: a month already gone is read as next year', () => {
  // In August, "15 ene" is not seven months in the past.
  assert.equal(day(findDate('15 ene', TODAY).date.toISOString()), '2027-01-15')
})

test('findDate: a month just gone stays in this year', () => {
  // July has only just passed: pushing it to 2027 would be worse than leaving it.
  assert.equal(day(findDate('20 jul', TODAY).date.toISOString()), '2026-07-20')
})

test('findDate: an impossible date is not invented', () => {
  assert.equal(findDate('31 feb', TODAY).date, null)
})

test('findDate: with no date it returns the whole text', () => {
  const r = findDate('Ejercicios del tema 5', TODAY)
  assert.equal(r.date, null)
  assert.equal(r.rest, 'Ejercicios del tema 5')
})

test('findDate: strips the label and leaves a clean title', () => {
  const r = findDate('Comentario de texto · Fecha de entrega: 9 ago', TODAY)
  assert.equal(r.rest, 'Comentario de texto')
})

// --- parseText -------------------------------------------------------------

test('a typical list: title, subject and date on three lines', () => {
  const r = read(`Ejercicios del tema 5
Matematicas
Fecha de entrega: 10 ago

Comentario de texto
Lengua
Fecha de entrega: 12 ago`)

  assert.equal(r.length, 2)
  assert.deepEqual(
    r.map((t) => [t.title, t.subject, day(t.dueDate)]),
    [
      ['Ejercicios del tema 5', 'Matematicas', '2026-08-10'],
      ['Comentario de texto', 'Lengua', '2026-08-12']
    ]
  )
})

test('title and date on one line, separated by a middle dot', () => {
  const r = read('Ejercicios 4 a 12 · Matematicas · Fecha de entrega: 10 ago')
  assert.deepEqual(
    [r[0].title, r[0].subject, day(r[0].dueDate)],
    ['Ejercicios 4 a 12', 'Matematicas', '2026-08-10']
  )
})

test('two tasks in a row with no subject do not swallow each other', () => {
  // The second arrives after a task that already has a date, so it is a new
  // task rather than the first one's subject.
  const r = read(`Ejercicios del tema 5
Fecha de entrega: 10 ago
Comentario de texto
Fecha de entrega: 12 ago`)

  assert.equal(r.length, 2)
  assert.deepEqual(r.map((t) => t.title), ['Ejercicios del tema 5', 'Comentario de texto'])
  assert.deepEqual(r.map((t) => t.subject), ['', ''])
})

test('the posted date is not taken as the due date', () => {
  // The most damaging failure of the lot: it would put the deadline in the past.
  const r = read(`Ejercicios del tema 5
Publicado el 3 ago
Fecha de entrega: 10 ago`)

  assert.equal(r.length, 1)
  assert.equal(day(r[0].dueDate), '2026-08-10')
})

test('headers, statuses and counters are ignored', () => {
  const r = read(`Trabajo de clase
Todo
Ejercicios del tema 5
Entregado
Ver detalles
3 de 5
Fecha de entrega: 10 ago`)

  assert.equal(r.length, 1)
  assert.equal(r[0].title, 'Ejercicios del tema 5')
})

test('a task with no date is still picked up', () => {
  const r = read(`Leer el capitulo 7
Historia`)
  assert.equal(r.length, 1)
  assert.equal(r[0].dueDate, null)
  assert.equal(r[0].subject, 'Historia')
})

test('a loose date only fills in a task that has none', () => {
  // Otherwise the second date line would overwrite the first task's.
  const r = read(`Ejercicios del tema 5
Fecha de entrega: 10 ago
Fecha de entrega: 20 ago`)

  assert.equal(r.length, 1)
  assert.equal(day(r[0].dueDate), '2026-08-10')
})

test('a long line is not mistaken for a subject', () => {
  // Past the limit it is treated as a new title: it is far likelier to be
  // another task than the name of a subject.
  const r = read(`Ejercicios del tema 5
Esto es una linea larguisima que desde luego no es el nombre de una asignatura`)
  assert.equal(r.length, 2)
})

test('the deadline is stored at the end of the day', () => {
  const [t] = read('Ejercicios · 10 ago')
  const d = new Date(t.dueDate)
  assert.equal(d.getHours(), 23)
  assert.equal(d.getMinutes(), 59)
})

test('empty text, or nothing but noise, proposes nothing', () => {
  assert.deepEqual(read(''), [])
  assert.deepEqual(read('   \n\n  '), [])
  assert.deepEqual(read('Trabajo de clase\nVer todo\n1 de 3'), [])
})

test('no more than 40 tasks are accepted from one paste', () => {
  const many = Array.from({ length: 60 }, (_, i) => `Tarea ${i} · 10 ago`).join('\n')
  assert.equal(read(many).length, 40)
})
