/**
 * Pruebas del planificador de estudio.
 *
 * Se prueba a traves de la funcion `calcular`, que es la que hace el trabajo,
 * inyectando un contexto falso. Asi no hace falta ni Electron ni Google: lo
 * que importa aqui es el reparto y la aritmetica de fechas, que es donde se
 * cuelan los fallos.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { calcular } = require(
  path.join(__dirname, '..', 'out', 'test', 'main', 'agent', 'tools', 'planificador-core.js')
)

/** Fecha relativa a hoy, para que las pruebas no dependan de cuando se ejecuten. */
function enDias(dias, hora = 12) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(hora, 0, 0, 0)
  return d
}

/** Contexto falso: solo lo que usa el planificador. */
function contexto({ eventos = [], tareas = [] } = {}) {
  return {
    calendar: {
      listEvents: async () => eventos,
      createEvent: async () => ({})
    },
    classroom: {
      listPending: async () => []
    },
    tasks: {
      list: () => tareas
    }
  }
}

const tarea = (titulo, diasHastaEntrega) => ({
  id: titulo,
  title: titulo,
  subject: 'Fisica',
  dueDate: diasHastaEntrega === null ? null : enDias(diasHastaEntrega, 23).toISOString(),
  done: false,
  createdAt: new Date().toISOString()
})

test('sin tareas pendientes no propone nada', async () => {
  const bloques = await calcular(7, contexto())
  assert.equal(bloques.length, 0)
})

test('las tareas hechas no cuentan', async () => {
  const hecha = { ...tarea('ya entregada', 3), done: true }
  const bloques = await calcular(7, contexto({ tareas: [hecha] }))
  assert.equal(bloques.length, 0)
})

test('propone bloques cuando el calendario esta vacio', async () => {
  const bloques = await calcular(7, contexto({ tareas: [tarea('tema 3', 5)] }))
  assert.ok(bloques.length > 0, 'deberia proponer al menos un bloque')
})

test('todos los bloques caen dentro de la franja de estudio', async () => {
  const bloques = await calcular(
    7,
    contexto({ tareas: [tarea('a', 5), tarea('b', 6), tarea('c', 7)] })
  )
  for (const b of bloques) {
    assert.ok(b.inicio.getHours() >= 16, `${b.inicio} empieza antes de las 16`)
    assert.ok(b.fin.getHours() <= 22, `${b.fin} termina despues de las 22`)
  }
})

test('nunca propone bloques en el pasado', async () => {
  const bloques = await calcular(3, contexto({ tareas: [tarea('x', 2)] }))
  const ahora = Date.now()
  for (const b of bloques) {
    assert.ok(b.fin.getTime() > ahora, `${b.fin} ya ha pasado`)
  }
})

test('no propone estudiar despues de la fecha de entrega', async () => {
  const bloques = await calcular(10, contexto({ tareas: [tarea('urgente', 1)] }))
  const limite = enDias(1, 23).getTime()
  for (const b of bloques) {
    assert.ok(b.fin.getTime() <= limite, `${b.fin} es posterior a la entrega`)
  }
})

test('esquiva los eventos que ya hay en el calendario', async () => {
  // Ocupa toda la franja de manana.
  const ocupado = [
    {
      id: 'clase',
      title: 'Clase particular',
      start: enDias(1, 16).toISOString(),
      end: enDias(1, 22).toISOString(),
      allDay: false
    }
  ]

  const bloques = await calcular(
    2,
    contexto({ tareas: [tarea('a', 5), tarea('b', 5)], eventos: ocupado })
  )

  const manana = enDias(1).toDateString()
  const enManana = bloques.filter((b) => b.inicio.toDateString() === manana)
  assert.equal(enManana.length, 0, 'no deberia proponer nada el dia ocupado entero')
})

test('un evento de dia completo no bloquea la tarde', async () => {
  const cumple = [
    {
      id: 'cumple',
      title: 'Cumpleanos',
      start: enDias(1, 0).toISOString(),
      end: enDias(2, 0).toISOString(),
      allDay: true
    }
  ]

  const bloques = await calcular(2, contexto({ tareas: [tarea('a', 5)], eventos: cumple }))
  assert.ok(bloques.length > 0, 'un evento de dia completo no deberia impedir estudiar')
})

test('los bloques no se solapan entre si', async () => {
  const bloques = await calcular(
    7,
    contexto({ tareas: [tarea('a', 4), tarea('b', 5), tarea('c', 6), tarea('d', 7)] })
  )

  const ordenados = [...bloques].sort((x, y) => x.inicio - y.inicio)
  for (let i = 1; i < ordenados.length; i++) {
    assert.ok(
      ordenados[i].inicio >= ordenados[i - 1].fin,
      `se solapan: ${ordenados[i - 1].fin} y ${ordenados[i].inicio}`
    )
  }
})

test('lo mas urgente se programa antes', async () => {
  const bloques = await calcular(
    10,
    contexto({ tareas: [tarea('lejana', 9), tarea('urgente', 2)] })
  )

  const primeraUrgente = bloques.findIndex((b) => b.tarea === 'urgente')
  const primeraLejana = bloques.findIndex((b) => b.tarea === 'lejana')

  assert.ok(primeraUrgente !== -1, 'la urgente deberia tener bloque')
  if (primeraLejana !== -1) {
    assert.ok(primeraUrgente < primeraLejana, 'la urgente deberia ir antes que la lejana')
  }
})

test('una tarea sin fecha tambien se planifica', async () => {
  const bloques = await calcular(7, contexto({ tareas: [tarea('sin fecha', null)] }))
  assert.ok(bloques.length > 0)
})

test('que Classroom falle no impide planificar', async () => {
  const ctx = contexto({ tareas: [tarea('a', 5)] })
  ctx.classroom.listPending = async () => {
    throw new Error('bloqueado por el centro')
  }
  const bloques = await calcular(7, ctx)
  assert.ok(bloques.length > 0, 'deberia seguir con las tareas propias')
})

test('que el calendario falle no impide planificar', async () => {
  const ctx = contexto({ tareas: [tarea('a', 5)] })
  ctx.calendar.listEvents = async () => {
    throw new Error('sin sesion')
  }
  const bloques = await calcular(7, ctx)
  assert.ok(bloques.length > 0, 'sin calendario, todas las horas estan libres')
})
