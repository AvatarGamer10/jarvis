/**
 * Pruebas del calculo de la proxima hora del resumen diario.
 *
 * Es aritmetica de fechas, que es donde mas facil se cuelan los fallos: cruzar
 * la medianoche, caer justo en la hora exacta, o que alguien deje el ajuste a
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

/** Fecha local concreta, para que las pruebas no dependan de cuando se ejecuten. */
const en = (y, m, d, h, min) => new Date(y, m - 1, d, h, min, 0, 0)

test('si la hora aun no ha llegado, es hoy', () => {
  const ahora = en(2026, 8, 4, 6, 0)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getDate(), 4)
  assert.equal(siguiente.getHours(), 7)
  assert.equal(siguiente.getMinutes(), 30)
})

test('si la hora ya paso, es manana', () => {
  const ahora = en(2026, 8, 4, 9, 0)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getDate(), 5)
  assert.equal(siguiente.getHours(), 7)
})

test('justo en la hora exacta se va a manana, no se dispara dos veces', () => {
  const ahora = en(2026, 8, 4, 7, 30)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getDate(), 5)
})

test('un minuto antes de la hora sigue siendo hoy', () => {
  const ahora = en(2026, 8, 4, 7, 29)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getDate(), 4)
})

test('cruza bien el final de mes', () => {
  const ahora = en(2026, 8, 31, 23, 50)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getMonth(), 8, 'debe pasar a septiembre')
  assert.equal(siguiente.getDate(), 1)
})

test('cruza bien el fin de ano', () => {
  const ahora = en(2026, 12, 31, 23, 59)
  const siguiente = nextOccurrence('07:30', ahora)
  assert.equal(siguiente.getFullYear(), 2027)
  assert.equal(siguiente.getMonth(), 0)
  assert.equal(siguiente.getDate(), 1)
})

test('medianoche se entiende como las 00:00', () => {
  const ahora = en(2026, 8, 4, 23, 0)
  const siguiente = nextOccurrence('00:00', ahora)
  assert.equal(siguiente.getDate(), 5)
  assert.equal(siguiente.getHours(), 0)
  assert.equal(siguiente.getMinutes(), 0)
})

test('una hora invalida cae al valor por defecto en vez de romper', () => {
  const ahora = en(2026, 8, 4, 6, 0)
  for (const malo of ['', 'abc', '99:99', '7', '25:00', '07:70']) {
    const siguiente = nextOccurrence(malo, ahora)
    assert.equal(siguiente.getHours(), 7, `"${malo}" deberia caer a 07:30`)
    assert.equal(siguiente.getMinutes(), 30, `"${malo}" deberia caer a 07:30`)
  }
})

test('siempre devuelve una fecha futura', () => {
  const ahora = en(2026, 8, 4, 12, 0)
  for (const hora of ['00:00', '07:30', '11:59', '12:00', '12:01', '23:59']) {
    assert.ok(
      nextOccurrence(hora, ahora).getTime() > ahora.getTime(),
      `${hora} deberia quedar en el futuro`
    )
  }
})

test('no se aleja mas de 24 horas', () => {
  const ahora = en(2026, 8, 4, 12, 0)
  for (const hora of ['00:00', '07:30', '12:01', '23:59']) {
    const diferencia = nextOccurrence(hora, ahora).getTime() - ahora.getTime()
    assert.ok(diferencia <= 24 * 60 * 60 * 1000, `${hora} no deberia pasar de 24 h`)
  }
})
