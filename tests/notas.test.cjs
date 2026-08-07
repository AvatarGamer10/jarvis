/**
 * Pruebas de las medias y las ponderaciones.
 *
 * Una media mal calculada no da error: da un numero equivocado con pinta de
 * correcto, y el usuario toma decisiones con el. De ahi que sea lo primero que
 * conviene tener cubierto de todo el modulo de notas.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { media, necesarioPara, porAsignatura, proximos } = require(
  path.join(__dirname, '..', 'out', 'test', 'main', 'tasks', 'notas-core.js')
)

let contador = 0
/** Examen minimo. `nota` y `peso` a null salvo que se digan. */
function examen({ asignatura = 'Fisica', titulo = 'Tema', nota = null, peso = null, fecha } = {}) {
  contador++
  return {
    id: `e${contador}`,
    subject: asignatura,
    title: `${titulo} ${contador}`,
    date: (fecha ?? new Date(2026, 0, contador)).toISOString(),
    grade: nota,
    weight: peso,
    createdAt: new Date(2026, 0, 1).toISOString()
  }
}

// --- media -----------------------------------------------------------------

test('media: sin notas todavia, no hay media que dar', () => {
  assert.deepEqual(media([examen(), examen()]), { valor: null, ponderada: false })
})

test('media: sin pesos, media simple', () => {
  const r = media([examen({ nota: 6 }), examen({ nota: 8 })])
  assert.equal(r.valor, 7)
  assert.equal(r.ponderada, false)
})

test('media: con pesos, se pondera', () => {
  // Un 4 que vale el 70% y un 9 que vale el 30% no dan 6,5.
  const r = media([examen({ nota: 4, peso: 70 }), examen({ nota: 9, peso: 30 })])
  assert.equal(r.valor, 5.5)
  assert.equal(r.ponderada, true)
})

test('media: los pesos no tienen que sumar 100', () => {
  // Quien apunta 30/30 a medias merece una media correcta sobre ese total.
  const r = media([examen({ nota: 4, peso: 30 }), examen({ nota: 8, peso: 30 })])
  assert.equal(r.valor, 6)
  assert.equal(r.ponderada, true)
})

test('media: si solo algunos llevan peso, se usa la simple', () => {
  // Ponderar con un peso inventado daria un numero con pinta de exacto que no
  // lo es. Mejor la media simple y decirlo.
  const r = media([examen({ nota: 4, peso: 70 }), examen({ nota: 8 })])
  assert.equal(r.valor, 6)
  assert.equal(r.ponderada, false)
})

test('media: los examenes sin nota no cuentan', () => {
  // El fallo tipico seria contarlos como cero y hundir la media.
  const r = media([examen({ nota: 8 }), examen()])
  assert.equal(r.valor, 8)
})

test('media: se redondea a dos decimales', () => {
  const r = media([examen({ nota: 5 }), examen({ nota: 6 }), examen({ nota: 8 })])
  assert.equal(r.valor, 6.33)
})

// --- necesarioPara ---------------------------------------------------------

test('necesarioPara: sin pesos no se puede calcular', () => {
  assert.equal(necesarioPara([examen({ nota: 4 }), examen()]), null)
})

test('necesarioPara: si no queda nada por hacer, no hay nada que calcular', () => {
  assert.equal(necesarioPara([examen({ nota: 4, peso: 50 }), examen({ nota: 8, peso: 50 })]), null)
})

test('necesarioPara: sin ninguna nota todavia no dice nada', () => {
  // La respuesta seria siempre "necesitas un 5", que es la definicion de
  // aprobar. Decirlo ocupa sitio y no informa.
  assert.equal(necesarioPara([examen({ peso: 50 }), examen({ peso: 50 })]), null)
})

test('necesarioPara: cuenta lo que falta sobre el peso que queda', () => {
  // Un 4 que vale el 50%: quedan 2 puntos de 5 conseguidos, hacen falta 5 de
  // media global, luego en el 50% restante hace falta un 6.
  const r = necesarioPara([examen({ nota: 4, peso: 50 }), examen({ peso: 50 })])
  assert.deepEqual(r, { estado: 'necesita', nota: 6 })
})

test('necesarioPara: con un buen primer examen, el aprobado queda asegurado', () => {
  // Un 9 que vale el 70% ya suma 6,3 de los 5 que hacen falta.
  const r = necesarioPara([examen({ nota: 9, peso: 70 }), examen({ peso: 30 })])
  assert.deepEqual(r, { estado: 'asegurado' })
})

test('necesarioPara: cuando ya no da ni con un 10, se dice', () => {
  // Un 1 que vale el 80%: aunque saque un 10 en el 20% restante se queda en 2,8.
  const r = necesarioPara([examen({ nota: 1, peso: 80 }), examen({ peso: 20 })])
  assert.deepEqual(r, { estado: 'imposible' })
})

test('necesarioPara: un 10 justo en lo que queda sigue siendo posible', () => {
  // 0 en el 50% obliga a un 10 en el otro 50%. Es el limite exacto: pasarse de
  // aqui por un redondeo daria "imposible" cuando aun se puede.
  const r = necesarioPara([examen({ nota: 0, peso: 50 }), examen({ peso: 50 })])
  assert.deepEqual(r, { estado: 'necesita', nota: 10 })
})

test('necesarioPara: acepta un objetivo distinto del aprobado', () => {
  const r = necesarioPara([examen({ nota: 6, peso: 50 }), examen({ peso: 50 })], 7)
  assert.deepEqual(r, { estado: 'necesita', nota: 8 })
})

// --- porAsignatura ---------------------------------------------------------

test('porAsignatura: agrupa y ordena alfabeticamente', () => {
  const r = porAsignatura([
    examen({ asignatura: 'Matematicas', nota: 7 }),
    examen({ asignatura: 'Biologia', nota: 5 })
  ])
  assert.deepEqual(r.map((x) => x.asignatura), ['Biologia', 'Matematicas'])
})

test('porAsignatura: mismas asignaturas escritas distinto son una sola', () => {
  // Sin esto, apuntar "fisica" un dia y "Física" otro parte la media en dos.
  const r = porAsignatura([
    examen({ asignatura: 'Física', nota: 4 }),
    examen({ asignatura: 'fisica', nota: 8 })
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].media, 6)
  // Se conserva el nombre tal como se escribio la primera vez.
  assert.equal(r[0].asignatura, 'Física')
})

test('porAsignatura: cuenta hechos y pendientes por separado', () => {
  const r = porAsignatura([
    examen({ asignatura: 'Ingles', nota: 7 }),
    examen({ asignatura: 'Ingles' }),
    examen({ asignatura: 'Ingles' })
  ])
  assert.equal(r[0].hechos, 1)
  assert.equal(r[0].pendientes, 2)
})

test('porAsignatura: los examenes sin asignatura no se pierden', () => {
  const r = porAsignatura([examen({ asignatura: '   ', nota: 5 })])
  assert.equal(r[0].asignatura, 'Sin asignatura')
})

// --- proximos --------------------------------------------------------------

const dia = (offset) => {
  const d = new Date(2026, 4, 10 + offset, 9, 0)
  return d
}

test('proximos: deja fuera los que ya pasaron', () => {
  const r = proximos([examen({ fecha: dia(-1) }), examen({ fecha: dia(3) })], dia(0))
  assert.equal(r.length, 1)
})

test('proximos: el de hoy cuenta como proximo durante todo el dia', () => {
  // Se compara el dia natural: un examen a las 9:00 no desaparece de la lista
  // a las 9:01, que es cuando el usuario va a mirarla.
  const aLasNueve = examen({ fecha: dia(0) })
  const porLaTarde = new Date(2026, 4, 10, 18, 0)
  assert.equal(proximos([aLasNueve], porLaTarde).length, 1)
})

test('proximos: del mas cercano al mas lejano', () => {
  const lejos = examen({ titulo: 'Lejos', fecha: dia(9) })
  const cerca = examen({ titulo: 'Cerca', fecha: dia(2) })
  const r = proximos([lejos, cerca], dia(0))
  assert.deepEqual(r.map((e) => e.title.split(' ')[0]), ['Cerca', 'Lejos'])
})

test('proximos: una fecha ilegible no rompe la lista', () => {
  const roto = { ...examen(), date: 'no es una fecha' }
  assert.equal(proximos([roto, examen({ fecha: dia(2) })], dia(0)).length, 1)
})
