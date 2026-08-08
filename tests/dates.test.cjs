/**
 * Tests for the date shortcuts and parsing.
 *
 * It looks trivial and it is not: the Friday shortcut depends on the day of the
 * week, and it has to be pinned to be testable at all. A shortcut that fills in
 * last week's date is worse than no shortcut.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { dateShortcuts, toInputDate, parseDate } = require(
  path.join(__dirname, '..', 'out', 'test', 'renderer', 'src', 'lib', 'dates.js')
)

// August 2026: the 3rd is a Monday and the 9th a Sunday.
const monday = new Date(2026, 7, 3, 15, 30)
const thursday = new Date(2026, 7, 6, 15, 30)
const friday = new Date(2026, 7, 7, 15, 30)
const saturday = new Date(2026, 7, 8, 15, 30)

const ids = (date) => dateShortcuts(date).map((s) => s.id)
const value = (date, id) => dateShortcuts(date).find((s) => s.id === id)?.value

// --- toInputDate -----------------------------------------------------------

test('toInputDate: local, not UTC', () => {
  // toISOString() goes through UTC and at 23:00 in Spain would give the next day.
  assert.equal(toInputDate(new Date(2026, 7, 7, 23, 0)), '2026-08-07')
})

test('toInputDate: pads month and day with a zero', () => {
  assert.equal(toInputDate(new Date(2026, 0, 5)), '2026-01-05')
})

// --- parseDate -------------------------------------------------------------

test('parseDate: a bare date is read as local, not UTC', () => {
  // new Date("2026-08-07") gives midnight UTC, which west of Greenwich lands on
  // the 6th and shifts the event a whole column.
  const d = parseDate('2026-08-07')
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth(), 7)
  assert.equal(d.getDate(), 7)
  assert.equal(d.getHours(), 0)
})

test('parseDate: a date with a time is taken as-is', () => {
  const iso = new Date(2026, 7, 7, 16, 30).toISOString()
  assert.equal(parseDate(iso).getHours(), 16)
})

// --- dateShortcuts ---------------------------------------------------------

test('today and tomorrow always come first', () => {
  assert.deepEqual(ids(monday).slice(0, 2), ['today', 'tomorrow'])
  assert.equal(value(monday, 'today'), '2026-08-03')
  assert.equal(value(monday, 'tomorrow'), '2026-08-04')
})

test('Friday points at this week’s Friday', () => {
  assert.equal(value(monday, 'friday'), '2026-08-07')
})

test('on a Friday, the Friday shortcut is not offered', () => {
  // It would be a second "Today" button under another name, which makes people
  // doubt whether they really do the same thing.
  assert.equal(ids(friday).includes('friday'), false)
})

test('on a Thursday it is dropped too: Friday is already "tomorrow"', () => {
  assert.equal(ids(thursday).includes('friday'), false)
})

test('on a Saturday, Friday is next week’s, never the one that has passed', () => {
  // The bug would be returning the 7th, which is behind us.
  assert.equal(value(saturday, 'friday'), '2026-08-14')
})

test('in a week is exactly seven days', () => {
  assert.equal(value(monday, 'week'), '2026-08-10')
})

test('the time of day does not change the result', () => {
  const early = dateShortcuts(new Date(2026, 7, 3, 0, 5))
  const late = dateShortcuts(new Date(2026, 7, 3, 23, 55))
  assert.deepEqual(early, late)
})
