/**
 * Tests for working out the next time the morning brief is due.
 *
 * It is date arithmetic, which is where bugs get in most easily: crossing
 * midnight, landing exactly on the hour, or somebody leaving the setting a
 * medio escribir.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { nextOccurrence } = require(
  path.join(__dirname, '..', 'out', 'test', 'main', 'brief', 'next-occurrence.js')
)

/** A fixed local date, so the tests do not depend on when they run. */
const en = (y, m, d, h, min) => new Date(y, m - 1, d, h, min, 0, 0)

test('if the time has not come yet, it is today', () => {
  const ahora = en(2026, 8, 4, 6, 0)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getDate(), 4)
  assert.equal(siguiente.getHours(), 7)
  assert.equal(siguiente.getMinutes(), 30)
})

test('if the time has passed, it is tomorrow', () => {
  const ahora = en(2026, 8, 4, 9, 0)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getDate(), 5)
  assert.equal(siguiente.getHours(), 7)
})

test('exactly on the hour it moves to tomorrow, so it cannot fire twice', () => {
  const ahora = en(2026, 8, 4, 7, 30)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getDate(), 5)
})

test('a minute before the hour it is still today', () => {
  const ahora = en(2026, 8, 4, 7, 29)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getDate(), 4)
})

test('it crosses the end of the month correctly', () => {
  const ahora = en(2026, 8, 31, 23, 50)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getMonth(), 8, 'debe pasar a septiembre')
  assert.equal(siguiente.getDate(), 1)
})

test('it crosses the end of the year correctly', () => {
  const ahora = en(2026, 12, 31, 23, 59)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getFullYear(), 2027)
  assert.equal(siguiente.getMonth(), 0)
  assert.equal(siguiente.getDate(), 1)
})

test('midnight is read as 00:00', () => {
  const ahora = en(2026, 8, 4, 23, 0)
  const siguiente = nextOccurrence('00:00', ahora)
  assert.equal(siguiente.getDate(), 5)
  assert.equal(siguiente.getHours(), 0)
  assert.equal(siguiente.getMinutes(), 0)
})

test('an invalid time falls back to the default rather than breaking', () => {
  const ahora = en(2026, 8, 4, 6, 0)
  for (const malo of ['', 'abc', '99:99', '7', '25:00', '07:70']) {
    const siguiente = nextOccurrence(malo, ahora)
    assert.equal(siguiente.getHours(), 7, `"${malo}" deberia caer a 07:30`)
    assert.equal(siguiente.getMinutes(), 30, `"${malo}" deberia caer a 07:30`)
  }
})

test('it always returns a date in the future', () => {
  const ahora = en(2026, 8, 4, 12, 0)
  for (const hora of ['00:00', '07:30', '11:59', '12:00', '12:01', '23:59']) {
    assert.ok(
      nextOccurrence(hora, ahora).getTime() > ahora.getTime(),
      `${hora} deberia quedar en el futuro`
    )
  }
})

test('it never goes more than 24 hours out', () => {
  const ahora = en(2026, 8, 4, 12, 0)
  for (const hora of ['00:00', '07:30', '12:01', '23:59']) {
    const diferencia = nextOccurrence(hora, ahora).getTime() - ahora.getTime()
    assert.ok(diferencia <= 24 * 60 * 60 * 1000, `${hora} no deberia pasar de 24 h`)
  }
})
