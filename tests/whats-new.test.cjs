/**
 * Tests for which release notes should be shown.
 *
 * Getting this wrong shows up in two ways and both are annoying: either the
 * user never learns the app changed, or they get the same screen every time
 * they open it.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { compareVersions, whatsNewPending, RELEASE_NOTES } = require(
  path.join(__dirname, '..', 'out', 'test', 'main', 'whatsNew.js')
)

const nota = (version) => ({ version, titulo: `v${version}`, puntos: ['algo'] })
const CATALOGO = [nota('1.2.0'), nota('1.1.0'), nota('1.0.0')]
const versiones = (r) => r.map((n) => n.version)

// --- compareVersions -------------------------------------------------------

test('compareVersions: orders by number, not as text', () => {
  // As strings, "1.10.0" < "1.9.0". As versions, the other way round.
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0)
})

test('compareVersions: equal versions give zero', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
})

test('compareVersions: missing parts count as zero', () => {
  assert.equal(compareVersions('1.0', '1.0.0'), 0)
  assert.ok(compareVersions('1.0.1', '1.0') > 0)
})

test('compareVersions: an unreadable version does not break the ordering', () => {
  assert.equal(compareVersions('vaya', '0.0.0'), 0)
})

// --- whatsNewPending -------------------------------------------------------

test('a fresh install shows nothing', () => {
  // The welcome screen already covers what is here; a "what's new" about
  // something you have just installed means nothing.
  assert.deepEqual(whatsNewPending('1.2.0', '', false, CATALOGO), [])
})

test('up to date: nothing is shown', () => {
  assert.deepEqual(whatsNewPending('1.2.0', '1.2.0', true, CATALOGO), [])
})

test('one version behind: only that one', () => {
  assert.deepEqual(versiones(whatsNewPending('1.2.0', '1.1.0', true, CATALOGO)), ['1.2.0'])
})

test('several versions behind: everything that was missed', () => {
  // Somebody who does not open the app for a month skips two versions; showing
  // only the latest hides half of what changed.
  assert.deepEqual(
    versiones(whatsNewPending('1.2.0', '1.0.0', true, CATALOGO)),
    ['1.2.0', '1.1.0']
  )
})

test('never shows anything newer than the installed version', () => {
  // The catalogue may already carry the next version, written in advance.
  assert.deepEqual(versiones(whatsNewPending('1.1.0', '1.0.0', true, CATALOGO)), ['1.1.0'])
})

test('an older user with no stored version: only the current one', () => {
  // They were using JARVIS before this screen existed. It is the only thing we
  // can say with certainty they have not seen.
  assert.deepEqual(versiones(whatsNewPending('1.1.0', '', true, CATALOGO)), ['1.1.0'])
})

test('an older user on a version with no notes: nothing is invented', () => {
  assert.deepEqual(whatsNewPending('1.3.0', '', true, CATALOGO), [])
})

test('downgrading shows nothing', () => {
  assert.deepEqual(whatsNewPending('1.0.0', '1.2.0', true, CATALOGO), [])
})

// --- The real catalogue ----------------------------------------------------

test('the catalogue runs newest to oldest', () => {
  for (let i = 1; i < RELEASE_NOTES.length; i++) {
    assert.ok(
      compareVersions(RELEASE_NOTES[i - 1].version, RELEASE_NOTES[i].version) > 0,
      `${RELEASE_NOTES[i - 1].version} deberia ir despues de ${RELEASE_NOTES[i].version}`
    )
  }
})

test('the catalogue covers the version in package.json', () => {
  // Shipping a version with no notes would leave the screen empty exactly when
  // the most has changed.
  const { version } = require(path.join(__dirname, '..', 'package.json'))
  assert.ok(
    RELEASE_NOTES.some((n) => compareVersions(n.version, version) === 0),
    `the entry for version ${version} is missing from whatsNew.ts`
  )
})

test('no entry is left without content', () => {
  for (const note of RELEASE_NOTES) {
    assert.ok(note.title.trim().length > 0, `${note.version} has no title`)
    assert.ok(note.points.length > 0, `${note.version} has no points`)
  }
})
