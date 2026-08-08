/**
 * Tests for the week grid arithmetic.
 *
 * It is pure date logic, which is exactly where the bugs hide: weeks that start
 * on Sunday, events that cross midnight, and Google's exclusive end date on
 * all-day events.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const {
  allDayEvents,
  daysOfWeek,
  isStudyBlock,
  mondayOf,
  placeDay,
  studyBlockTitle,
  visibleBand,
  weekTitle
} = require(path.join(__dirname, '..', 'out', 'test', 'renderer', 'src', 'lib', 'week.js'))

/** A timed event. Months are 1-12 here, like a real calendar. */
function event(id, day, from, to, title = id) {
  const start = new Date(2026, 7, day, ...from)
  const end = new Date(2026, 7, day, ...to)
  return { id, title, start: start.toISOString(), end: end.toISOString(), allDay: false }
}

// --- mondayOf --------------------------------------------------------------

test('mondayOf: a Wednesday steps back to that week’s Monday', () => {
  // 2026-08-05 is a Wednesday.
  assert.equal(mondayOf(new Date(2026, 7, 5)).getDate(), 3)
})

test('mondayOf: a Sunday belongs to the week ending, not the one starting', () => {
  // The classic bug: getDay() returns 0 for Sunday and a naive calculation
  // sends it six days forward instead of six back.
  const monday = mondayOf(new Date(2026, 7, 9)) // Sunday
  assert.equal(monday.getDate(), 3)
  assert.equal(monday.getDay(), 1)
})

test('mondayOf: a Monday stays put, at 00:00', () => {
  const monday = mondayOf(new Date(2026, 7, 3, 23, 40))
  assert.equal(monday.getDate(), 3)
  assert.equal(monday.getHours(), 0)
})

test('mondayOf: crosses a month boundary backwards', () => {
  // Tuesday 1 September: its Monday falls in August.
  const monday = mondayOf(new Date(2026, 8, 1))
  assert.equal(monday.getMonth(), 7)
  assert.equal(monday.getDate(), 31)
})

test('daysOfWeek: seven consecutive days, Monday to Sunday', () => {
  const days = daysOfWeek(mondayOf(new Date(2026, 7, 5)))
  assert.equal(days.length, 7)
  assert.deepEqual(days.map((d) => d.getDate()), [3, 4, 5, 6, 7, 8, 9])
  assert.equal(days[6].getDay(), 0)
})

// --- visibleBand -----------------------------------------------------------

test('visibleBand: with no events, the default window', () => {
  assert.deepEqual(visibleBand([]), { start: 8, end: 22 })
})

test('visibleBand: widens upwards if something starts before 08:00', () => {
  assert.equal(visibleBand([event('a', 3, [6, 45], [7, 30])]).start, 6)
})

test('visibleBand: widens downwards if something ends after 22:00', () => {
  assert.equal(visibleBand([event('a', 3, [21, 0], [23, 15])]).end, 24)
})

test('visibleBand: an event ending on the hour does not add the next row', () => {
  assert.equal(visibleBand([event('a', 3, [21, 0], [22, 0])]).end, 22)
})

test('visibleBand: all-day events do not move it', () => {
  const allDay = { id: 'x', title: 'Party', start: '2026-08-05', end: '2026-08-06', allDay: true }
  assert.deepEqual(visibleBand([allDay]), { start: 8, end: 22 })
})

// --- placeDay --------------------------------------------------------------

const day = new Date(2026, 7, 5)

test('placeDay: position and height come from the event’s time', () => {
  const [placed] = placeDay([event('a', 5, [10, 0], [11, 30])], day, 8)
  assert.equal(placed.from, 120) // two hours after the top of the band
  assert.equal(placed.length, 90)
  assert.equal(placed.columns, 1)
})

test('placeDay: only takes that day’s events', () => {
  const placed = placeDay(
    [event('a', 5, [10, 0], [11, 0]), event('b', 6, [10, 0], [11, 0])],
    day,
    8
  )
  assert.deepEqual(placed.map((p) => p.event.id), ['a'])
})

test('placeDay: two overlapping events split into two columns', () => {
  // Without the split the second paints on top of the first and is never seen.
  const placed = placeDay(
    [event('a', 5, [10, 0], [11, 0]), event('b', 5, [10, 30], [11, 30])],
    day,
    8
  )
  assert.deepEqual(placed.map((p) => p.column), [0, 1])
  assert.ok(placed.every((p) => p.columns === 2))
})

test('placeDay: back-to-back events that do not overlap take the full width', () => {
  const placed = placeDay(
    [event('a', 5, [10, 0], [11, 0]), event('b', 5, [11, 0], [12, 0])],
    day,
    8
  )
  assert.ok(placed.every((p) => p.columns === 1))
})

test('placeDay: an event crossing midnight is clipped to the end of the day', () => {
  // Otherwise the end lands before the start and the height comes out negative.
  const crossing = {
    id: 'a',
    title: 'Journey',
    start: new Date(2026, 7, 5, 22, 0).toISOString(),
    end: new Date(2026, 7, 6, 3, 0).toISOString(),
    allDay: false
  }
  const [placed] = placeDay([crossing], day, 8)
  assert.equal(placed.length, 120) // 22:00 to 24:00
})

test('placeDay: a zero-length event keeps a readable minimum height', () => {
  // And does not stretch to nightfall, which is what happened when "end <=
  // start" was treated the same as crossing midnight.
  const [placed] = placeDay([event('a', 5, [10, 0], [10, 0])], day, 8)
  assert.equal(placed.length, 30)
})

test('placeDay: an unreadable end is assumed to be an hour, not the rest of the day', () => {
  const broken = {
    id: 'a',
    title: 'No end',
    start: new Date(2026, 7, 5, 10, 0).toISOString(),
    end: 'this is not a date',
    allDay: false
  }
  const [placed] = placeDay([broken], day, 8)
  assert.equal(placed.length, 60)
})

// --- allDayEvents ----------------------------------------------------------

const allDay = (id, start, end) => ({ id, title: id, start, end, allDay: true })

test('allDayEvents: the end is exclusive, as in Google', () => {
  // A single-day event arrives with end on the following day. Treating it as
  // inclusive would paint it across two columns.
  const e = allDay('Party', '2026-08-05', '2026-08-06')
  assert.equal(allDayEvents([e], new Date(2026, 7, 5)).length, 1)
  assert.equal(allDayEvents([e], new Date(2026, 7, 6)).length, 0)
})

test('allDayEvents: a multi-day one appears on every day it covers', () => {
  const e = allDay('Trip', '2026-08-05', '2026-08-08')
  const days = [5, 6, 7, 8].map((d) => allDayEvents([e], new Date(2026, 7, d)).length)
  assert.deepEqual(days, [1, 1, 1, 0])
})

test('allDayEvents: ignores timed events', () => {
  assert.equal(allDayEvents([event('a', 5, [10, 0], [11, 0])], day).length, 0)
})

// --- study blocks ----------------------------------------------------------

test('isStudyBlock: recognises what the planner creates', () => {
  assert.equal(isStudyBlock({ title: 'Study: Maths' }), true)
  assert.equal(isStudyBlock({ title: 'Maths class' }), false)
})

test('isStudyBlock: still recognises blocks written by older versions', () => {
  // These are sitting in real calendars and must not silently turn into
  // ordinary events.
  assert.equal(isStudyBlock({ title: 'Estudiar: Mates' }), true)
})

test('studyBlockTitle: strips either prefix', () => {
  assert.equal(studyBlockTitle('Study: Maths'), 'Maths')
  assert.equal(studyBlockTitle('Estudiar: Mates'), 'Mates')
})

// --- weekTitle -------------------------------------------------------------

test('weekTitle: does not repeat the month when the week stays inside it', () => {
  assert.equal(weekTitle(new Date(2026, 7, 3)), '3 – 9 August')
})

test('weekTitle: names both months when the week crosses them', () => {
  assert.equal(weekTitle(new Date(2026, 7, 31)), '31 August – 6 September')
})

test('weekTitle: adds the year when the week crosses into one', () => {
  // 28 December 2026 is a Monday; that week ends on 3 January 2027.
  assert.equal(weekTitle(new Date(2026, 11, 28)), '28 December – 3 January 2027')
})
