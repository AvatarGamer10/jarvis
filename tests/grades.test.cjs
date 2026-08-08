/**
 * Tests for averages and weightings.
 *
 * A badly calculated average does not raise an error: it produces a wrong
 * number that looks right, and the user makes decisions with it. That is why
 * it is the first thing in the grades module worth covering.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { average, neededFor, bySubject, upcoming } = require(
  path.join(__dirname, '..', 'out', 'test', 'main', 'tasks', 'grades-core.js')
)

let counter = 0
/** The smallest possible exam. `grade` and `weight` are null unless given. */
function exam({ subject = 'Physics', title = 'Topic', grade = null, weight = null, date } = {}) {
  counter++
  return {
    id: `e${counter}`,
    subject,
    title: `${title} ${counter}`,
    date: (date ?? new Date(2026, 0, counter)).toISOString(),
    grade,
    weight,
    createdAt: new Date(2026, 0, 1).toISOString()
  }
}

// --- average ---------------------------------------------------------------

test('average: with no grades yet, there is no average to give', () => {
  assert.deepEqual(average([exam(), exam()]), { value: null, weighted: false })
})

test('average: with no weights, a plain mean', () => {
  const r = average([exam({ grade: 6 }), exam({ grade: 8 })])
  assert.equal(r.value, 7)
  assert.equal(r.weighted, false)
})

test('average: with weights, it is weighted', () => {
  // A 4 worth 70% and a 9 worth 30% do not make 6.5.
  const r = average([exam({ grade: 4, weight: 70 }), exam({ grade: 9, weight: 30 })])
  assert.equal(r.value, 5.5)
  assert.equal(r.weighted, true)
})

test('average: the weights do not have to add up to 100', () => {
  // Somebody who has written down 30/30 so far deserves a correct average
  // against that total.
  const r = average([exam({ grade: 4, weight: 30 }), exam({ grade: 8, weight: 30 })])
  assert.equal(r.value, 6)
  assert.equal(r.weighted, true)
})

test('average: if only some carry a weight, the plain mean is used', () => {
  // Weighting with an invented weight would give a number that looks exact and
  // is not. Better the plain mean, and say so.
  const r = average([exam({ grade: 4, weight: 70 }), exam({ grade: 8 })])
  assert.equal(r.value, 6)
  assert.equal(r.weighted, false)
})

test('average: exams with no grade do not count', () => {
  // The classic bug would be counting them as zero and sinking the average.
  const r = average([exam({ grade: 8 }), exam()])
  assert.equal(r.value, 8)
})

test('average: rounded to two decimal places', () => {
  const r = average([exam({ grade: 5 }), exam({ grade: 6 }), exam({ grade: 8 })])
  assert.equal(r.value, 6.33)
})

// --- neededFor -------------------------------------------------------------

test('neededFor: without weights it cannot be calculated', () => {
  assert.equal(neededFor([exam({ grade: 4 }), exam()]), null)
})

test('neededFor: with nothing left to sit, there is nothing to calculate', () => {
  assert.equal(neededFor([exam({ grade: 4, weight: 50 }), exam({ grade: 8, weight: 50 })]), null)
})

test('neededFor: with no grades at all yet it says nothing', () => {
  // The answer would always be "you need a 5", which is the definition of
  // passing. Saying it takes up room and informs nobody.
  assert.equal(neededFor([exam({ weight: 50 }), exam({ weight: 50 })]), null)
})

test('neededFor: counts what is missing against the weight that is left', () => {
  // A 4 worth 50%: two points of the five needed are banked, so the remaining
  // 50% has to produce a 6.
  const r = neededFor([exam({ grade: 4, weight: 50 }), exam({ weight: 50 })])
  assert.deepEqual(r, { state: 'needs', grade: 6 })
})

test('neededFor: a strong first exam makes the pass safe', () => {
  // A 9 worth 70% already contributes 6.3 of the 5 required.
  const r = neededFor([exam({ grade: 9, weight: 70 }), exam({ weight: 30 })])
  assert.deepEqual(r, { state: 'safe' })
})

test('neededFor: when even a 10 will not do it, it says so', () => {
  // A 1 worth 80%: even a 10 in the remaining 20% only reaches 2.8.
  const r = neededFor([exam({ grade: 1, weight: 80 }), exam({ weight: 20 })])
  assert.deepEqual(r, { state: 'impossible' })
})

test('neededFor: exactly a 10 in what is left is still possible', () => {
  // A 0 in 50% forces a 10 in the other 50%. This is the exact boundary:
  // overshooting it by a rounding error would say "impossible" while it is not.
  const r = neededFor([exam({ grade: 0, weight: 50 }), exam({ weight: 50 })])
  assert.deepEqual(r, { state: 'needs', grade: 10 })
})

test('neededFor: accepts a target other than the pass mark', () => {
  const r = neededFor([exam({ grade: 6, weight: 50 }), exam({ weight: 50 })], 7)
  assert.deepEqual(r, { state: 'needs', grade: 8 })
})

// --- bySubject -------------------------------------------------------------

test('bySubject: groups and orders alphabetically', () => {
  const r = bySubject([exam({ subject: 'Maths', grade: 7 }), exam({ subject: 'Biology', grade: 5 })])
  assert.deepEqual(
    r.map((x) => x.subject),
    ['Biology', 'Maths']
  )
})

test('bySubject: the same subject spelled differently is one subject', () => {
  // Without this, writing "fisica" one day and "Física" the next splits the
  // average in two.
  const r = bySubject([exam({ subject: 'Física', grade: 4 }), exam({ subject: 'fisica', grade: 8 })])
  assert.equal(r.length, 1)
  assert.equal(r[0].average, 6)
  // The name is kept as it was first written.
  assert.equal(r[0].subject, 'Física')
})

test('bySubject: counts done and pending separately', () => {
  const r = bySubject([
    exam({ subject: 'English', grade: 7 }),
    exam({ subject: 'English' }),
    exam({ subject: 'English' })
  ])
  assert.equal(r[0].done, 1)
  assert.equal(r[0].pending, 2)
})

test('bySubject: exams with no subject are not lost', () => {
  const r = bySubject([exam({ subject: '   ', grade: 5 })])
  assert.equal(r[0].subject, 'No subject')
})

// --- upcoming --------------------------------------------------------------

const day = (offset) => new Date(2026, 4, 10 + offset, 9, 0)

test('upcoming: leaves out the ones that have passed', () => {
  const r = upcoming([exam({ date: day(-1) }), exam({ date: day(3) })], day(0))
  assert.equal(r.length, 1)
})

test("upcoming: today's counts as upcoming all day", () => {
  // The calendar day is what is compared: an exam at 09:00 does not vanish
  // from the list at 09:01, which is when the user goes to look at it.
  const atNine = exam({ date: day(0) })
  const thatAfternoon = new Date(2026, 4, 10, 18, 0)
  assert.equal(upcoming([atNine], thatAfternoon).length, 1)
})

test('upcoming: nearest first, furthest last', () => {
  const far = exam({ title: 'Far', date: day(9) })
  const near = exam({ title: 'Near', date: day(2) })
  const r = upcoming([far, near], day(0))
  assert.deepEqual(
    r.map((e) => e.title.split(' ')[0]),
    ['Near', 'Far']
  )
})

test('upcoming: an unreadable date does not break the list', () => {
  const broken = { ...exam(), date: 'not a date' }
  assert.equal(upcoming([broken, exam({ date: day(2) })], day(0)).length, 1)
})
