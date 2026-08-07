/**
 * Pruebas del analizador de texto pegado de Classroom.
 *
 * Es la via que funciona sin modelo, asi que tiene que acertar sola con las
 * listas normales. Y equivocarse en una fecha aqui es peor que no sacarla:
 * una entrega colocada en el dia que no es se cuela en el resumen y en el
 * planificador sin que nadie lo note.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { extraerFecha, interpretarTexto } = require(
  path.join(__dirname, '..', 'out', 'test', 'main', 'tasks', 'pegar-core.js')
)

// Viernes 7 de agosto de 2026. Fijo, para que las pruebas no dependan de hoy.
const HOY = new Date(2026, 7, 7, 12, 0)

/** "AAAA-MM-DD" en local, para comparar sin pelearse con la zona horaria. */
const dia = (iso) => {
  if (iso === null) return null
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

const leer = (texto) => interpretarTexto(texto, HOY)

// --- extraerFecha ----------------------------------------------------------

test('extraerFecha: dia y mes abreviado', () => {
  const r = extraerFecha('Fecha de entrega: 10 ago', HOY)
  assert.equal(dia(r.fecha.toISOString()), '2026-08-10')
  assert.equal(r.resto, '')
})

test('extraerFecha: dia y mes completo', () => {
  const r = extraerFecha('Entrega el 12 de septiembre', HOY)
  assert.equal(dia(r.fecha.toISOString()), '2026-09-12')
})

test('extraerFecha: formato con barras', () => {
  assert.equal(dia(extraerFecha('15/09/2026', HOY).fecha.toISOString()), '2026-09-15')
})

test('extraerFecha: con barras y ano de dos cifras', () => {
  assert.equal(dia(extraerFecha('15/09/26', HOY).fecha.toISOString()), '2026-09-15')
})

test('extraerFecha: sin ano se prefiere el formato largo al de barras', () => {
  // "8/8" tambien casa dentro de "8 de agosto de 2026"; si ganara el patron de
  // barras se perderia el ano.
  const r = extraerFecha('8 de agosto de 2027', HOY)
  assert.equal(dia(r.fecha.toISOString()), '2027-08-08')
})

test('extraerFecha: hoy y manana', () => {
  assert.equal(dia(extraerFecha('hoy', HOY).fecha.toISOString()), '2026-08-07')
  assert.equal(dia(extraerFecha('Fecha de entrega: manana', HOY).fecha.toISOString()), '2026-08-08')
})

test('extraerFecha: acepta tildes', () => {
  assert.equal(dia(extraerFecha('mañana', HOY).fecha.toISOString()), '2026-08-08')
})

test('extraerFecha: dia de la semana, siempre hacia delante', () => {
  // Hoy es viernes: el lunes que viene es el 10, no el pasado.
  assert.equal(dia(extraerFecha('para el lunes', HOY).fecha.toISOString()), '2026-08-10')
})

test('extraerFecha: un mes que ya paso se entiende del ano que viene', () => {
  // En agosto, "15 ene" no es de hace siete meses.
  assert.equal(dia(extraerFecha('15 ene', HOY).fecha.toISOString()), '2027-01-15')
})

test('extraerFecha: un mes recien pasado se queda en este ano', () => {
  // Julio acaba de pasar: mandarlo a 2027 seria peor que dejarlo donde esta.
  assert.equal(dia(extraerFecha('20 jul', HOY).fecha.toISOString()), '2026-07-20')
})

test('extraerFecha: una fecha imposible no se inventa', () => {
  assert.equal(extraerFecha('31 feb', HOY).fecha, null)
})

test('extraerFecha: sin fecha devuelve el texto entero', () => {
  const r = extraerFecha('Ejercicios del tema 5', HOY)
  assert.equal(r.fecha, null)
  assert.equal(r.resto, 'Ejercicios del tema 5')
})

test('extraerFecha: quita la etiqueta y deja el titulo limpio', () => {
  const r = extraerFecha('Comentario de texto · Fecha de entrega: 9 ago', HOY)
  assert.equal(r.resto, 'Comentario de texto')
})

// --- interpretarTexto ------------------------------------------------------

test('lista tipica: titulo, asignatura y fecha en tres lineas', () => {
  const r = leer(`Ejercicios del tema 5
Matematicas
Fecha de entrega: 10 ago

Comentario de texto
Lengua
Fecha de entrega: 12 ago`)

  assert.equal(r.length, 2)
  assert.deepEqual(
    r.map((t) => [t.titulo, t.asignatura, dia(t.entrega)]),
    [
      ['Ejercicios del tema 5', 'Matematicas', '2026-08-10'],
      ['Comentario de texto', 'Lengua', '2026-08-12']
    ]
  )
})

test('titulo y fecha en la misma linea, separados por punto medio', () => {
  const r = leer('Ejercicios 4 a 12 · Matematicas · Fecha de entrega: 10 ago')
  assert.deepEqual(
    [r[0].titulo, r[0].asignatura, dia(r[0].entrega)],
    ['Ejercicios 4 a 12', 'Matematicas', '2026-08-10']
  )
})

test('dos tareas seguidas sin asignatura no se comen la una a la otra', () => {
  // La segunda llega detras de una tarea que ya tiene fecha, asi que es una
  // tarea nueva y no la asignatura de la primera.
  const r = leer(`Ejercicios del tema 5
Fecha de entrega: 10 ago
Comentario de texto
Fecha de entrega: 12 ago`)

  assert.equal(r.length, 2)
  assert.deepEqual(r.map((t) => t.titulo), ['Ejercicios del tema 5', 'Comentario de texto'])
  assert.deepEqual(r.map((t) => t.asignatura), ['', ''])
})

test('la fecha de publicacion no se toma como fecha de entrega', () => {
  // Es el fallo que mas dano hace: colocaria la entrega en el pasado.
  const r = leer(`Ejercicios del tema 5
Publicado el 3 ago
Fecha de entrega: 10 ago`)

  assert.equal(r.length, 1)
  assert.equal(dia(r[0].entrega), '2026-08-10')
})

test('se ignoran cabeceras, estados y contadores', () => {
  const r = leer(`Trabajo de clase
Todo
Ejercicios del tema 5
Entregado
Ver detalles
3 de 5
Fecha de entrega: 10 ago`)

  assert.equal(r.length, 1)
  assert.equal(r[0].titulo, 'Ejercicios del tema 5')
})

test('una tarea sin fecha se recoge igual', () => {
  const r = leer(`Leer el capitulo 7
Historia`)
  assert.equal(r.length, 1)
  assert.equal(r[0].entrega, null)
  assert.equal(r[0].asignatura, 'Historia')
})

test('la fecha suelta solo completa a quien no la tiene', () => {
  // Si no, la segunda linea de fecha pisaria la de la primera tarea.
  const r = leer(`Ejercicios del tema 5
Fecha de entrega: 10 ago
Fecha de entrega: 20 ago`)

  assert.equal(r.length, 1)
  assert.equal(dia(r[0].entrega), '2026-08-10')
})

test('una asignatura larga no se confunde con la asignatura', () => {
  // Por encima del limite se trata como un titulo nuevo: es mas probable que
  // sea otra tarea que el nombre de una materia.
  const r = leer(`Ejercicios del tema 5
Esto es una linea larguisima que desde luego no es el nombre de una asignatura`)
  assert.equal(r.length, 2)
})

test('la entrega se guarda al final del dia', () => {
  const [t] = leer('Ejercicios · 10 ago')
  const d = new Date(t.entrega)
  assert.equal(d.getHours(), 23)
  assert.equal(d.getMinutes(), 59)
})

test('texto vacio o solo ruido no propone nada', () => {
  assert.deepEqual(leer(''), [])
  assert.deepEqual(leer('   \n\n  '), [])
  assert.deepEqual(leer('Trabajo de clase\nVer todo\n1 de 3'), [])
})

test('no se aceptan mas de 40 tareas de una pegada', () => {
  const muchas = Array.from({ length: 60 }, (_, i) => `Tarea ${i} · 10 ago`).join('\n')
  assert.equal(leer(muchas).length, 40)
})
