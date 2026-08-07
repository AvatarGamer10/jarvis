/**
 * Pruebas de la aritmetica de la rejilla semanal.
 *
 * Es logica pura de fechas, que es justo donde se cuelan los fallos: semanas
 * que empiezan en domingo, eventos que cruzan la medianoche, y el fin
 * exclusivo de los eventos de dia completo de Google.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const {
  colocarDia,
  diasDeLaSemana,
  esBloqueEstudio,
  eventosDeDiaCompleto,
  fechaDe,
  franja,
  lunesDe,
  tituloSemana
} = require(path.join(__dirname, '..', 'out', 'test', 'renderer', 'src', 'lib', 'semana.js'))

/** Evento con hora. Los meses van 1-12, como en el calendario de verdad. */
function evento(id, dia, desde, hasta, titulo = id) {
  const inicio = new Date(2026, 7, dia, ...desde)
  const fin = new Date(2026, 7, dia, ...hasta)
  return { id, title: titulo, start: inicio.toISOString(), end: fin.toISOString(), allDay: false }
}

// --- lunesDe ---------------------------------------------------------------

test('lunesDe: un miercoles retrocede al lunes de esa semana', () => {
  // 2026-08-05 es miercoles.
  assert.equal(lunesDe(new Date(2026, 7, 5)).getDate(), 3)
})

test('lunesDe: un domingo pertenece a la semana que acaba, no a la que empieza', () => {
  // El fallo clasico: getDay() da 0 para domingo y un calculo ingenuo lo manda
  // seis dias adelante en vez de seis atras.
  const lunes = lunesDe(new Date(2026, 7, 9)) // domingo
  assert.equal(lunes.getDate(), 3)
  assert.equal(lunes.getDay(), 1)
})

test('lunesDe: un lunes se queda donde esta, a las 00:00', () => {
  const lunes = lunesDe(new Date(2026, 7, 3, 23, 40))
  assert.equal(lunes.getDate(), 3)
  assert.equal(lunes.getHours(), 0)
})

test('lunesDe: cruza el cambio de mes hacia atras', () => {
  // Martes 1 de septiembre: su lunes cae en agosto.
  const lunes = lunesDe(new Date(2026, 8, 1))
  assert.equal(lunes.getMonth(), 7)
  assert.equal(lunes.getDate(), 31)
})

test('diasDeLaSemana: siete dias consecutivos de lunes a domingo', () => {
  const dias = diasDeLaSemana(lunesDe(new Date(2026, 7, 5)))
  assert.equal(dias.length, 7)
  assert.deepEqual(dias.map((d) => d.getDate()), [3, 4, 5, 6, 7, 8, 9])
  assert.equal(dias[6].getDay(), 0)
})

// --- fechaDe ---------------------------------------------------------------

test('fechaDe: una fecha sin hora se interpreta en local, no en UTC', () => {
  // new Date("2026-08-07") daria medianoche UTC, que en husos negativos cae el
  // dia 6 y descoloca el evento una columna entera.
  const d = fechaDe('2026-08-07')
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth(), 7)
  assert.equal(d.getDate(), 7)
  assert.equal(d.getHours(), 0)
})

test('fechaDe: una fecha con hora se respeta tal cual', () => {
  const iso = new Date(2026, 7, 7, 16, 30).toISOString()
  assert.equal(fechaDe(iso).getHours(), 16)
})

// --- franja ----------------------------------------------------------------

test('franja: sin eventos, la ventana por defecto', () => {
  assert.deepEqual(franja([]), { inicio: 8, fin: 22 })
})

test('franja: se amplia hacia arriba si algo empieza antes de las 8', () => {
  assert.equal(franja([evento('a', 3, [6, 45], [7, 30])]).inicio, 6)
})

test('franja: se amplia hacia abajo si algo termina despues de las 22', () => {
  assert.equal(franja([evento('a', 3, [21, 0], [23, 15])]).fin, 24)
})

test('franja: un evento que acaba en punto no anade la hora siguiente', () => {
  assert.equal(franja([evento('a', 3, [21, 0], [22, 0])]).fin, 22)
})

test('franja: los eventos de dia completo no la mueven', () => {
  const todoElDia = { id: 'x', title: 'Fiesta', start: '2026-08-05', end: '2026-08-06', allDay: true }
  assert.deepEqual(franja([todoElDia]), { inicio: 8, fin: 22 })
})

// --- colocarDia ------------------------------------------------------------

const dia = new Date(2026, 7, 5)

test('colocarDia: posicion y altura salen de la hora del evento', () => {
  const [c] = colocarDia([evento('a', 5, [10, 0], [11, 30])], dia, 8)
  assert.equal(c.desde, 120) // dos horas despues del inicio de la franja
  assert.equal(c.duracion, 90)
  assert.equal(c.columnas, 1)
})

test('colocarDia: solo coge los eventos de ese dia', () => {
  const colocados = colocarDia(
    [evento('a', 5, [10, 0], [11, 0]), evento('b', 6, [10, 0], [11, 0])],
    dia,
    8
  )
  assert.deepEqual(colocados.map((c) => c.evento.id), ['a'])
})

test('colocarDia: dos eventos a la vez se reparten en dos columnas', () => {
  // Sin reparto, el segundo se pintaria encima del primero y no se veria.
  const colocados = colocarDia(
    [evento('a', 5, [10, 0], [11, 0]), evento('b', 5, [10, 30], [11, 30])],
    dia,
    8
  )
  assert.deepEqual(colocados.map((c) => c.columna), [0, 1])
  assert.ok(colocados.every((c) => c.columnas === 2))
})

test('colocarDia: eventos seguidos pero sin pisarse ocupan el ancho entero', () => {
  const colocados = colocarDia(
    [evento('a', 5, [10, 0], [11, 0]), evento('b', 5, [11, 0], [12, 0])],
    dia,
    8
  )
  assert.ok(colocados.every((c) => c.columnas === 1))
})

test('colocarDia: un evento que cruza la medianoche se recorta al final del dia', () => {
  // Si no, minFin saldria menor que minInicio y la altura seria negativa.
  const cruza = {
    id: 'a',
    title: 'Viaje',
    start: new Date(2026, 7, 5, 22, 0).toISOString(),
    end: new Date(2026, 7, 6, 3, 0).toISOString(),
    allDay: false
  }
  const [c] = colocarDia([cruza], dia, 8)
  assert.equal(c.duracion, 120) // de 22:00 a 24:00
})

test('colocarDia: un evento sin duracion conserva una altura minima legible', () => {
  // Y no se estira hasta la noche, que es lo que pasaba cuando "fin <= inicio"
  // se trataba igual que cruzar la medianoche.
  const [c] = colocarDia([evento('a', 5, [10, 0], [10, 0])], dia, 8)
  assert.equal(c.duracion, 30)
})

test('colocarDia: un fin ilegible se asume de una hora, no del resto del dia', () => {
  const roto = {
    id: 'a',
    title: 'Sin fin',
    start: new Date(2026, 7, 5, 10, 0).toISOString(),
    end: 'esto no es una fecha',
    allDay: false
  }
  const [c] = colocarDia([roto], dia, 8)
  assert.equal(c.duracion, 60)
})

// --- eventosDeDiaCompleto --------------------------------------------------

const diaCompleto = (id, inicio, fin) => ({ id, title: id, start: inicio, end: fin, allDay: true })

test('eventosDeDiaCompleto: el fin es exclusivo, como en Google', () => {
  // Un evento de un solo dia llega con end en el dia siguiente. Tomarlo como
  // inclusivo lo pintaria en dos columnas.
  const e = diaCompleto('Fiesta', '2026-08-05', '2026-08-06')
  assert.equal(eventosDeDiaCompleto([e], new Date(2026, 7, 5)).length, 1)
  assert.equal(eventosDeDiaCompleto([e], new Date(2026, 7, 6)).length, 0)
})

test('eventosDeDiaCompleto: uno de varios dias aparece en todos ellos', () => {
  const e = diaCompleto('Excursion', '2026-08-05', '2026-08-08')
  const dias = [5, 6, 7, 8].map((d) => eventosDeDiaCompleto([e], new Date(2026, 7, d)).length)
  assert.deepEqual(dias, [1, 1, 1, 0])
})

test('eventosDeDiaCompleto: ignora los eventos con hora', () => {
  assert.equal(eventosDeDiaCompleto([evento('a', 5, [10, 0], [11, 0])], dia).length, 0)
})

// --- varios ----------------------------------------------------------------

test('esBloqueEstudio: distingue lo que crea el planificador', () => {
  assert.equal(esBloqueEstudio({ title: 'Estudiar: Mates' }), true)
  assert.equal(esBloqueEstudio({ title: 'Clase de mates' }), false)
})

test('tituloSemana: no repite el mes cuando la semana no lo cruza', () => {
  assert.equal(tituloSemana(new Date(2026, 7, 3)), '3 – 9 de agosto')
})

test('tituloSemana: nombra los dos meses cuando la semana los cruza', () => {
  assert.equal(tituloSemana(new Date(2026, 7, 31)), '31 de agosto – 6 de septiembre')
})
