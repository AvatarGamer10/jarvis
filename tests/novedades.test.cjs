/**
 * Pruebas de que novedades tocan ensenar.
 *
 * Equivocarse aqui se nota de dos maneras y las dos molestan: o el usuario no
 * se entera de que la app ha cambiado, o le sale la misma pantalla cada vez que
 * la abre.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { compararVersiones, novedadesPendientes, NOVEDADES } = require(
  path.join(__dirname, '..', 'out', 'test', 'main', 'novedades.js')
)

const nota = (version) => ({ version, titulo: `v${version}`, puntos: ['algo'] })
const CATALOGO = [nota('1.2.0'), nota('1.1.0'), nota('1.0.0')]
const versiones = (r) => r.map((n) => n.version)

// --- compararVersiones -----------------------------------------------------

test('compararVersiones: ordena por numero, no por texto', () => {
  // Como cadenas, "1.10.0" < "1.9.0". Como versiones, al reves.
  assert.ok(compararVersiones('1.10.0', '1.9.0') > 0)
})

test('compararVersiones: iguales dan cero', () => {
  assert.equal(compararVersiones('1.0.0', '1.0.0'), 0)
})

test('compararVersiones: los huecos cuentan como cero', () => {
  assert.equal(compararVersiones('1.0', '1.0.0'), 0)
  assert.ok(compararVersiones('1.0.1', '1.0') > 0)
})

test('compararVersiones: una version ilegible no rompe el orden', () => {
  assert.equal(compararVersiones('vaya', '0.0.0'), 0)
})

// --- novedadesPendientes ---------------------------------------------------

test('instalacion nueva: no se ensena nada', () => {
  // La bienvenida ya cuenta lo que hay; un "que hay de nuevo" de algo que
  // acabas de instalar no significa nada.
  assert.deepEqual(novedadesPendientes('1.2.0', '', false, CATALOGO), [])
})

test('al dia: no se ensena nada', () => {
  assert.deepEqual(novedadesPendientes('1.2.0', '1.2.0', true, CATALOGO), [])
})

test('una version de salto: solo esa', () => {
  assert.deepEqual(versiones(novedadesPendientes('1.2.0', '1.1.0', true, CATALOGO)), ['1.2.0'])
})

test('varias versiones de salto: todas las que se ha perdido', () => {
  // Quien no abre la app en un mes se salta dos versiones; ensenarle solo la
  // ultima le esconde la mitad de lo que ha cambiado.
  assert.deepEqual(
    versiones(novedadesPendientes('1.2.0', '1.0.0', true, CATALOGO)),
    ['1.2.0', '1.1.0']
  )
})

test('nunca se ensena algo mas nuevo que la version instalada', () => {
  // El catalogo puede traer ya escrita la version siguiente.
  assert.deepEqual(versiones(novedadesPendientes('1.1.0', '1.0.0', true, CATALOGO)), ['1.1.0'])
})

test('usuario antiguo sin version guardada: solo lo de la version actual', () => {
  // Ya usaba JARVIS antes de que existiera esta pantalla. Es lo unico que se
  // puede afirmar con certeza que no ha visto.
  assert.deepEqual(versiones(novedadesPendientes('1.1.0', '', true, CATALOGO)), ['1.1.0'])
})

test('usuario antiguo en una version sin notas: no se inventa nada', () => {
  assert.deepEqual(novedadesPendientes('1.3.0', '', true, CATALOGO), [])
})

test('bajar de version no ensena nada', () => {
  assert.deepEqual(novedadesPendientes('1.0.0', '1.2.0', true, CATALOGO), [])
})

// --- El catalogo de verdad -------------------------------------------------

test('el catalogo va de la mas nueva a la mas antigua', () => {
  for (let i = 1; i < NOVEDADES.length; i++) {
    assert.ok(
      compararVersiones(NOVEDADES[i - 1].version, NOVEDADES[i].version) > 0,
      `${NOVEDADES[i - 1].version} deberia ir despues de ${NOVEDADES[i].version}`
    )
  }
})

test('el catalogo cubre la version de package.json', () => {
  // Publicar una version sin notas dejaria la pantalla vacia justo cuando mas
  // cosas han cambiado.
  const { version } = require(path.join(__dirname, '..', 'package.json'))
  assert.ok(
    NOVEDADES.some((n) => compararVersiones(n.version, version) === 0),
    `falta la entrada de la version ${version} en novedades.ts`
  )
})

test('ninguna entrada se queda sin contenido', () => {
  for (const n of NOVEDADES) {
    assert.ok(n.titulo.trim().length > 0, `${n.version} sin titulo`)
    assert.ok(n.puntos.length > 0, `${n.version} sin puntos`)
  }
})
