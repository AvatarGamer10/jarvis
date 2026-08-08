/**
 * The next time the clock will read HH:mm.
 *
 * A pure function with an injectable `now` so it can be tested: working out
 * "tomorrow at 7:30" is one of those things that looks trivial and then fails
 * on
 * el cambio de hora o justo al cruzar la medianoche.
 */
export function nextOccurrence(time: string, ahora: Date = new Date()): Date {
  const [rawHours, rawMinutes] = time.split(':')
  const hours = Number(rawHours)
  const minutes = Number(rawMinutes)

  // An invalid time in the settings cannot leave the user with no brief: it
  // falls back to the default rather than throwing or returning nonsense.
  const validas =
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59

  const objetivo = new Date(ahora)
  objetivo.setHours(validas ? hours : 7, validas ? minutes : 30, 0, 0)

  // If today's time has passed — or is exactly now — it is tomorrow's turn.
  if (objetivo.getTime() <= ahora.getTime()) {
    objetivo.setDate(objetivo.getDate() + 1)
  }

  return objetivo
}
