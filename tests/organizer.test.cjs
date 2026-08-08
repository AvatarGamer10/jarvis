/**
 * Tests for the folder organiser, against real files in a temporary folder.
 * It is the one module that can do actual damage, so it is tested thoroughly:
 * above all that it cannot escape the authorised folders, and that a file is
 * never lost.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const OUT = path.join(__dirname, '..', 'out', 'test', 'main', 'organizer')
const { isInside, assertAllowed, availableName } = require(path.join(OUT, 'paths.js'))
const { planMoves } = require(path.join(OUT, 'planner.js'))
const { applyPlan, undoBatch } = require(path.join(OUT, 'executor.js'))

/** Crea un arbol de prueba aislado y devuelve sus rutas. */
function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-test-'))
  const downloads = path.join(root, 'Descargas')
  const school = path.join(root, 'Colegio', 'Fisica')
  fs.mkdirSync(downloads, { recursive: true })
  fs.mkdirSync(school, { recursive: true })
  for (const name of files) fs.writeFileSync(path.join(downloads, name), 'contenido')
  return { root, downloads, school }
}

const rule = (over) => ({
  id: 'r1',
  enabled: true,
  name: 'PDFs de Fisica',
  source: '',
  destination: '',
  extensions: ['pdf'],
  nameContains: 'fisica',
  ...over
})

// --- Guardas de rutas -----------------------------------------------------

test('isInside accepts paths inside the root', () => {
  const { root, downloads } = makeTree([])
  assert.equal(isInside(root, downloads), true)
  assert.equal(isInside(root, root), true)
})

test('isInside refuses to leave the root with ..', () => {
  const { root, downloads } = makeTree([])
  assert.equal(isInside(downloads, path.join(downloads, '..', '..')), false)
  assert.equal(isInside(root, path.join(root, '..')), false)
})

test('isInside refuses system paths', () => {
  const { root } = makeTree([])
  assert.equal(isInside(root, 'C:\\Windows\\System32'), false)
  assert.equal(isInside(root, path.join(root, '..', '..', 'Windows')), false)
})

test('assertAllowed throws when there is no authorised root', () => {
  assert.throws(() => assertAllowed([], 'C:\\cualquiera'), /outside the authorised folders/)
})

test('assertAllowed throws for a path outside the roots', () => {
  const { root } = makeTree([])
  assert.throws(() => assertAllowed([root], 'C:\\Windows'), /outside the authorised folders/)
})

// --- Planificacion --------------------------------------------------------

test('planMoves selects only what matches the rule', () => {
  const { root, downloads, school } = makeTree([
    'tema1 fisica.pdf',
    'tema2 fisica.pdf',
    'apuntes historia.pdf',
    'fisica.docx'
  ])

  const plan = planMoves([rule({ source: downloads, destination: school })], [root])

  assert.equal(plan.moves.length, 2)
  const names = plan.moves.map((m) => path.basename(m.from)).sort()
  assert.deepEqual(names, ['tema1 fisica.pdf', 'tema2 fisica.pdf'])
  assert.equal(plan.skipped, 2)
})

test('planMoves ignores rules pointing outside the roots', () => {
  const { root, school } = makeTree(['tema1 fisica.pdf'])
  const plan = planMoves([rule({ source: 'C:\\Windows', destination: school })], [root])
  assert.equal(plan.moves.length, 0)
})

test('planMoves does not touch subfolders', () => {
  const { root, downloads, school } = makeTree(['tema1 fisica.pdf'])
  const nested = path.join(downloads, 'subcarpeta')
  fs.mkdirSync(nested)
  fs.writeFileSync(path.join(nested, 'tema9 fisica.pdf'), 'x')

  const plan = planMoves([rule({ source: downloads, destination: school })], [root])
  assert.equal(plan.moves.length, 1)
})

test('planMoves renames if the destination already has that file', () => {
  const { root, downloads, school } = makeTree(['tema1 fisica.pdf'])
  fs.writeFileSync(path.join(school, 'tema1 fisica.pdf'), 'the one that was already there')

  const plan = planMoves([rule({ source: downloads, destination: school })], [root])
  assert.equal(plan.moves.length, 1)
  assert.equal(plan.moves[0].renamedTo, 'tema1 fisica (2).pdf')
})

// --- Ejecucion y deshacer -------------------------------------------------

test('applyPlan moves the files and undoBatch puts them back', () => {
  const { root, downloads, school } = makeTree(['tema1 fisica.pdf', 'tema2 fisica.pdf'])
  const plan = planMoves([rule({ source: downloads, destination: school })], [root])

  const applied = applyPlan(plan, [root])
  assert.equal(applied.moved.length, 2)
  assert.equal(applied.failed.length, 0)
  assert.equal(fs.readdirSync(downloads).length, 0)
  assert.equal(fs.readdirSync(school).length, 2)

  const undone = undoBatch({ id: 'b1', appliedAt: '', moves: applied.moved }, [root])
  assert.equal(undone.moved.length, 2)
  assert.equal(undone.failed.length, 0)
  assert.equal(fs.readdirSync(downloads).sort().join(), 'tema1 fisica.pdf,tema2 fisica.pdf')
  assert.equal(fs.readdirSync(school).length, 0)
})

test('applyPlan nunca sobrescribe un archivo existente', () => {
  const { root, downloads, school } = makeTree(['tema1 fisica.pdf'])
  const plan = planMoves([rule({ source: downloads, destination: school })], [root])

  // The file appears at the destination AFTER the plan was calculated.
  fs.writeFileSync(path.join(school, 'tema1 fisica.pdf'), 'no me pises')

  const applied = applyPlan(plan, [root])
  assert.equal(applied.moved.length, 1)
  assert.equal(
    fs.readFileSync(path.join(school, 'tema1 fisica.pdf'), 'utf8'),
    'no me pises',
    'the file that was already there must be left intact'
  )
  assert.equal(fs.existsSync(path.join(school, 'tema1 fisica (2).pdf')), true)
})

test('applyPlan rejects moves outside the authorised roots', () => {
  const { root, downloads } = makeTree(['tema1 fisica.pdf'])
  // Simulates a tampered plan trying to write into the system.
  const malicious = {
    id: 'p1',
    createdAt: '',
    skipped: 0,
    moves: [
      {
        from: path.join(downloads, 'tema1 fisica.pdf'),
        to: 'C:\\Windows\\System32\\tema1 fisica.pdf',
        rule: 'inyectada'
      }
    ]
  }

  const applied = applyPlan(malicious, [root])
  assert.equal(applied.moved.length, 0)
  assert.equal(applied.failed.length, 1)
  assert.match(applied.failed[0].error, /outside the authorised folders/)
  assert.equal(fs.existsSync(path.join(downloads, 'tema1 fisica.pdf')), true)
})

test('availableName finds a free slot without overwriting', () => {
  const { school } = makeTree([])
  fs.writeFileSync(path.join(school, 'a.pdf'), 'x')
  fs.writeFileSync(path.join(school, 'a (2).pdf'), 'x')
  assert.equal(availableName(school, 'a.pdf'), 'a (3).pdf')
})
