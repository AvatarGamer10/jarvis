import type { CalendarEvent } from '@shared/types'

/**
 * Utilidades para la rejilla semanal.
 *
 * Separadas del componente porque son aritmetica de fechas pura, que es donde
 * se cuelan los fallos: semanas que empiezan en domingo, eventos que cruzan la
 * medianoche y solapamientos.
 */

/** Franja visible por defecto. Se amplia si hay eventos fuera. */
export const HORA_MIN = 8
export const HORA_MAX = 22

export interface EventoColocado {
  evento: CalendarEvent
  /** Minutos desde el inicio de la franja visible. */
  desde: number
  /** Duracion en minutos. */
  duracion: number
  /** Columna dentro del grupo de solapados, y cuantas hay en el grupo. */
  columna: number
  columnas: number
}

/**
 * Interpreta la fecha de un evento.
 *
 * Los eventos de dia completo llegan de Google como "2026-08-07", sin hora, y
 * `new Date()` los lee como medianoche UTC. En husos negativos eso los coloca
 * el dia anterior, asi que las fechas sin hora se construyen en local.
 */
export function fechaDe(iso: string): Date {
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!soloFecha) return new Date(iso)
  return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
}

/** Lunes de la semana que contiene esa fecha. */
export function lunesDe(fecha: Date): Date {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  // getDay() devuelve 0 para domingo; aqui la semana empieza en lunes.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export function diasDeLaSemana(lunes: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes)
    d.setDate(d.getDate() + i)
    return d
  })
}

export const mismoDia = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()

/** Los bloques que crea el planificador se distinguen por su titulo. */
export const esBloqueEstudio = (evento: CalendarEvent): boolean =>
  evento.title.startsWith('Estudiar:')

/**
 * Franja horaria a mostrar.
 *
 * Se parte de 8-22 y se amplia si hay eventos fuera, en vez de pintar las 24
 * horas siempre: nadie tiene nada a las 4 de la manana, y esas filas vacias
 * solo comprimen el resto del dia.
 */
export function franja(eventos: CalendarEvent[]): { inicio: number; fin: number } {
  let inicio = HORA_MIN
  let fin = HORA_MAX

  for (const e of eventos) {
    if (e.allDay) continue
    const desde = fechaDe(e.start)
    const hasta = fechaDe(e.end)
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) continue

    inicio = Math.min(inicio, desde.getHours())
    // Si termina en punto, no hace falta ensenar la hora siguiente entera.
    const horaFin = hasta.getMinutes() > 0 ? hasta.getHours() + 1 : hasta.getHours()
    if (mismoDia(desde, hasta)) fin = Math.max(fin, horaFin)
  }

  return { inicio: Math.max(0, inicio), fin: Math.min(24, Math.max(fin, inicio + 4)) }
}

/**
 * Coloca los eventos de un dia, repartiendo en columnas los que se solapan.
 *
 * Sin esto, dos clases a la misma hora se pintan una encima de otra y solo se
 * ve la ultima.
 */
export function colocarDia(
  eventos: CalendarEvent[],
  dia: Date,
  inicioFranja: number
): EventoColocado[] {
  const delDia = eventos
    .filter((e) => !e.allDay && mismoDia(fechaDe(e.start), dia))
    .map((e) => {
      const desde = fechaDe(e.start)
      const hasta = fechaDe(e.end)
      const minInicio = desde.getHours() * 60 + desde.getMinutes()
      let minFin: number

      if (Number.isNaN(hasta.getTime())) {
        // Sin hora de fin utilizable se asume una hora, no el resto del dia.
        minFin = minInicio + 60
      } else if (!mismoDia(hasta, dia)) {
        // Cruza la medianoche: se recorta al final del dia. Sin esto su altura
        // saldria negativa y el evento desapareceria de la rejilla.
        minFin = 24 * 60
      } else {
        minFin = hasta.getHours() * 60 + hasta.getMinutes()
      }

      return {
        evento: e,
        desde: minInicio - inicioFranja * 60,
        // Minimo de media hora: por debajo no cabe ni el titulo.
        duracion: Math.max(30, minFin - minInicio)
      }
    })
    .sort((a, b) => a.desde - b.desde)

  // Reparto en columnas: se agrupan los que se pisan entre si y el grupo se
  // cierra en cuanto aparece uno que ya no toca a ninguno.
  const colocados: EventoColocado[] = []
  let grupo: typeof delDia = []

  const cerrarGrupo = (): void => {
    grupo.forEach((e, i) => colocados.push({ ...e, columna: i, columnas: grupo.length }))
    grupo = []
  }

  for (const e of delDia) {
    const pisaAAlguno = grupo.some((g) => e.desde < g.desde + g.duracion)
    if (grupo.length > 0 && !pisaAAlguno) cerrarGrupo()
    grupo.push(e)
  }
  cerrarGrupo()

  return colocados
}

/**
 * Eventos de dia completo que cubren ese dia.
 *
 * En Google el fin de un evento de dia completo es exclusivo: un evento de un
 * solo dia termina el dia siguiente. De ahi el `<` en vez de `<=`.
 */
export function eventosDeDiaCompleto(eventos: CalendarEvent[], dia: Date): CalendarEvent[] {
  return eventos.filter((e) => {
    if (!e.allDay) return false
    const desde = fechaDe(e.start)
    const hasta = fechaDe(e.end)
    if (Number.isNaN(desde.getTime())) return false
    if (Number.isNaN(hasta.getTime()) || hasta <= desde) return mismoDia(desde, dia)
    return dia >= desde && dia < hasta
  })
}

/** Titulo de la semana, sin repetir el mes cuando es el mismo. */
export function tituloSemana(lunes: Date): string {
  const domingo = new Date(lunes)
  domingo.setDate(domingo.getDate() + 6)

  const mes = new Intl.DateTimeFormat('es-ES', { month: 'long' })
  const finLargo = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' })

  if (lunes.getMonth() === domingo.getMonth()) {
    return `${lunes.getDate()} – ${finLargo.format(domingo)}`
  }
  return `${lunes.getDate()} de ${mes.format(lunes)} – ${finLargo.format(domingo)}`
}
