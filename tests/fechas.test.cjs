/**
 * Pruebas de los atajos de fecha.
 *
 * Parece trivial y no lo es: el atajo del viernes depende del dia de la semana
 * y hay que fijarlo para poder probarlo. Un atajo que pone la fecha de la
 * semana pasada es peor que no tener atajo.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { atajosFecha, paraInput } = require(
  path.join(__dirname, '..', 'out', 'test', 'renderer', 'src', 'lib', 'fechas.js')
)

// Agosto de 2026: el 3 es lunes y el 9 domingo.
const lunes = new Date(2026, 7, 3, 15, 30)
const jueves = new Date(2026, 7, 6, 15, 30)
const viernes = new Date(2026, 7, 7, 15, 30)
const sabado = new Date(2026, 7, 8, 15, 30)

const ids = (fecha) => atajosFecha(fecha).map((a) => a.id)
const valor = (fecha, id) => atajosFecha(fecha).find((a) => a.id === id)?.valor

test('paraInput: formato local, no UTC', () => {
  // toISOString() pasa por UTC y a las 23:00 en Espana daria el dia siguiente.
  assert.equal(paraInput(new Date(2026, 7, 7, 23, 0)), '2026-08-07')
})

test('paraInput: rellena mes y dia con cero', () => {
  assert.equal(paraInput(new Date(2026, 0, 5)), '2026-01-05')
})

test('hoy y manana son siempre los dos primeros', () => {
  assert.deepEqual(ids(lunes).slice(0, 2), ['hoy', 'manana'])
  assert.equal(valor(lunes, 'hoy'), '2026-08-03')
  assert.equal(valor(lunes, 'manana'), '2026-08-04')
})

test('el viernes apunta al viernes de esta semana', () => {
  assert.equal(valor(lunes, 'viernes'), '2026-08-07')
})

test('en viernes no se ofrece el atajo del viernes', () => {
  // Seria un segundo boton "Hoy" con otro nombre, y eso hace dudar de si de
  // verdad hacen lo mismo.
  assert.equal(ids(viernes).includes('viernes'), false)
})

test('en jueves tampoco: el viernes ya es "manana"', () => {
  assert.equal(ids(jueves).includes('viernes'), false)
})

test('en sabado el viernes es el de la semana que viene, nunca el pasado', () => {
  // El fallo seria devolver el 7, que ya paso.
  assert.equal(valor(sabado, 'viernes'), '2026-08-14')
})

test('en una semana son siete dias justos', () => {
  assert.equal(valor(lunes, 'semana'), '2026-08-10')
})

test('la hora del dia no afecta al resultado', () => {
  const temprano = atajosFecha(new Date(2026, 7, 3, 0, 5))
  const tarde = atajosFecha(new Date(2026, 7, 3, 23, 55))
  assert.deepEqual(temprano, tarde)
})
