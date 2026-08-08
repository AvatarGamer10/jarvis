/**
 * Tests for the study planner.
 *
 * Exercised through `planBlocks`, which is the function that does the work,
 * with a fake context injected. That way neither Electron nor Google is
 * needed: what matters here is the distribution and the date arithmetic, which
 * is where the bugs get in.
 *
 *   npm test
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { planBlocks } = require(
  path.join(__dirname, '..', 'out', 'test', 'main', 'agent', 'tools', 'planner-core.js')
)

/** A date relative to today, so the tests do not depend on when they run. */
function inDays(days, hour = 12) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

/** Fake context: only what the planner actually uses. */
function context({ events = [], tasks = [], exams = [] } = {}) {
  return {
    calendar: {
      listEvents: async () => events,
      createEvent: async () => ({})
    },
    classroom: {
      listPending: async () => []
    },
    tasks: {
      list: () => tasks
    },
    exams: {
      list: () => exams
    }
  }
}

const task = (title, daysUntilDue) => ({
  id: title,
  title,
  subject: 'Physics',
  dueDate: daysUntilDue === null ? null : inDays(daysUntilDue, 23).toISOString(),
  done: false,
  createdAt: new Date().toISOString()
})

const exam = (title, daysUntil, grade = null) => ({
  id: title,
  title,
  subject: 'Physics',
  // At nine in the morning: that is when exams are, and it is also the hour
  // that makes the tie-break against a deadline the same day meaningful.
  date: inDays(daysUntil, 9).toISOString(),
  grade,
  weight: null,
  createdAt: new Date().toISOString()
})

test('with nothing outstanding it proposes nothing', async () => {
  const blocks = await planBlocks(7, context())
  assert.equal(blocks.length, 0)
})

test('finished tasks do not count', async () => {
  const finished = { ...task('already handed in', 3), done: true }
  const blocks = await planBlocks(7, context({ tasks: [finished] }))
  assert.equal(blocks.length, 0)
})

test('proposes blocks when the calendar is empty', async () => {
  const blocks = await planBlocks(7, context({ tasks: [task('topic 3', 5)] }))
  assert.ok(blocks.length > 0, 'it should propose at least one block')
})

test('every block falls inside the study window', async () => {
  const blocks = await planBlocks(
    7,
    context({ tasks: [task('a', 5), task('b', 6), task('c', 7)] })
  )
  for (const b of blocks) {
    assert.ok(b.start.getHours() >= 16, `${b.start} starts before 16:00`)
    assert.ok(b.end.getHours() <= 22, `${b.end} ends after 22:00`)
  }
})

test('it never proposes blocks in the past', async () => {
  const blocks = await planBlocks(3, context({ tasks: [task('x', 2)] }))
  const now = Date.now()
  for (const b of blocks) {
    assert.ok(b.end.getTime() > now, `${b.end} has already passed`)
  }
})

// --- Exams -----------------------------------------------------------------

test('an exam on the same day as a deadline is studied first', async () => {
  // This is the whole reason priority exists: a deadline can be finished off
  // the night before, an exam cannot.
  const blocks = await planBlocks(
    7,
    context({ tasks: [task('deadline', 5)], exams: [exam('exam', 5)] })
  )
  assert.equal(blocks[0].task, 'exam')
})

test('an exam gets more blocks than a task', async () => {
  const withExam = await planBlocks(7, context({ exams: [exam('exam', 5)] }))
  const withTask = await planBlocks(7, context({ tasks: [task('deadline', 5)] }))
  assert.ok(
    withExam.length > withTask.length,
    `exam ${withExam.length} blocks vs task ${withTask.length}`
  )
})

test('exams that have already been marked are not studied', async () => {
  const blocks = await planBlocks(7, context({ exams: [exam('done', 3, 7)] }))
  assert.equal(blocks.length, 0)
})

test('exams that have already happened are not studied', async () => {
  const blocks = await planBlocks(7, context({ exams: [exam('past', -2)] }))
  assert.equal(blocks.length, 0)
})

test('it does not propose studying after the exam', async () => {
  const blocks = await planBlocks(7, context({ exams: [exam('exam', 2)] }))
  const when = inDays(2, 9).getTime()
  for (const b of blocks) {
    assert.ok(b.end.getTime() <= when, `${b.end} falls after the exam`)
  }
})

test('it does not propose studying after the due date', async () => {
  const blocks = await planBlocks(10, context({ tasks: [task('urgent', 1)] }))
  const limit = inDays(1, 23).getTime()
  for (const b of blocks) {
    assert.ok(b.end.getTime() <= limit, `${b.end} is later than the deadline`)
  }
})

test('it works around what is already in the calendar', async () => {
  // Takes up the whole of tomorrow's window.
  const busy = [
    {
      id: 'lesson',
      title: 'Private lesson',
      start: inDays(1, 16).toISOString(),
      end: inDays(1, 22).toISOString(),
      allDay: false
    }
  ]

  const blocks = await planBlocks(
    2,
    context({ tasks: [task('a', 5), task('b', 5)], events: busy })
  )

  const tomorrow = inDays(1).toDateString()
  const onTomorrow = blocks.filter((b) => b.start.toDateString() === tomorrow)
  assert.equal(onTomorrow.length, 0, 'it should propose nothing on the fully booked day')
})

test('an all-day event does not block out the afternoon', async () => {
  const birthday = [
    {
      id: 'birthday',
      title: 'Birthday',
      start: inDays(1, 0).toISOString(),
      end: inDays(2, 0).toISOString(),
      allDay: true
    }
  ]

  const blocks = await planBlocks(2, context({ tasks: [task('a', 5)], events: birthday }))
  assert.ok(blocks.length > 0, 'an all-day event should not prevent studying')
})

test('blocks never overlap each other', async () => {
  const blocks = await planBlocks(
    7,
    context({ tasks: [task('a', 4), task('b', 5), task('c', 6), task('d', 7)] })
  )

  const ordered = [...blocks].sort((x, y) => x.start - y.start)
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(
      ordered[i].start >= ordered[i - 1].end,
      `they overlap: ${ordered[i - 1].end} and ${ordered[i].start}`
    )
  }
})

test('the most urgent thing is scheduled first', async () => {
  const blocks = await planBlocks(
    10,
    context({ tasks: [task('distant', 9), task('urgent', 2)] })
  )

  const firstUrgent = blocks.findIndex((b) => b.task === 'urgent')
  const firstDistant = blocks.findIndex((b) => b.task === 'distant')

  assert.ok(firstUrgent !== -1, 'the urgent one should get a block')
  if (firstDistant !== -1) {
    assert.ok(firstUrgent < firstDistant, 'the urgent one should come before the distant one')
  }
})

test('a task with no date is planned too', async () => {
  const blocks = await planBlocks(7, context({ tasks: [task('no date', null)] }))
  assert.ok(blocks.length > 0)
})

test('Classroom failing does not stop the planning', async () => {
  const ctx = context({ tasks: [task('a', 5)] })
  ctx.classroom.listPending = async () => {
    throw new Error('blocked by the school')
  }
  const blocks = await planBlocks(7, ctx)
  assert.ok(blocks.length > 0, 'it should carry on with the user’s own tasks')
})

test('the calendar failing does not stop the planning', async () => {
  const ctx = context({ tasks: [task('a', 5)] })
  ctx.calendar.listEvents = async () => {
    throw new Error('no session')
  }
  const blocks = await planBlocks(7, ctx)
  assert.ok(blocks.length > 0, 'with no calendar, every hour is free')
})
