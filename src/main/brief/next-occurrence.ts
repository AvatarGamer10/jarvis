/**
 * Proxima vez que el reloj marcara HH:mm.
 *
 * Funcion pura y con `ahora` inyectable para poder probarla: el calculo de
 * "manana a las 7:30" es de esas cosas que parecen triviales y luego fallan en
 * el cambio de hora o justo al cruzar la medianoche.
 */
export function nextOccurrence(time: string, ahora: Date = new Date()): Date {
  const [rawHours, rawMinutes] = time.split(':')
  const hours = Number(rawHours)
  const minutes = Number(rawMinutes)

  // Una hora invalida en los ajustes no puede dejar al usuario sin resumen:
  // se cae al valor por defecto en vez de lanzar o devolver una fecha absurda.
  const validas =
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59

  const objetivo = new Date(ahora)
  objetivo.setHours(validas ? hours : 7, validas ? minutes : 30, 0, 0)

  // Si la hora de hoy ya paso (o es exactamente ahora), toca manana.
  if (objetivo.getTime() <= ahora.getTime()) {
    objetivo.setDate(objetivo.getDate() + 1)
  }

  return objetivo
}
