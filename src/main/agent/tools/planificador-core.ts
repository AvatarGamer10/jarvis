import type { BriefTask, CalendarEvent, Examen, ManualTask } from '@shared/types'

/**
 * Reparto de bloques de estudio. Puro y sin dependencias del resto de la app.
 *
 * Vive separado de la definicion de la herramienta para poder probarlo: la
 * herramienta arrastra toda la cadena de servicios (y con ella los ajustes y
 * las credenciales), que no compila fuera de Electron. Aqui solo hay
 * aritmetica de fechas, que es justo lo que conviene tener cubierto.
 */

/** Franja del dia en la que tiene sentido estudiar. */
export const HORA_INICIO = 16
export const HORA_FIN = 22
/** Duracion de cada bloque, en minutos. Estudiar cuatro horas seguidas no funciona. */
export const BLOQUE_MIN = 60
/** Descanso entre bloques del mismo dia. */
const DESCANSO_MIN = 15

export interface Bloque {
  inicio: Date
  fin: Date
  tarea: string
  asignatura: string
}

/**
 * Lo minimo que necesita el planificador.
 *
 * Se declara aqui en vez de usar el contexto completo de herramientas: pedir
 * solo lo que se usa deja claro el alcance y permite probarlo con un doble.
 */
export interface FuentesPlanificador {
  calendar: { listEvents(desde: string, hasta: string): Promise<CalendarEvent[]> }
  classroom: { listPending(): Promise<{ title: string; courseName: string; dueDate: string | null }[]> }
  tasks: { list(): ManualTask[] }
  examenes: { list(): Examen[] }
}

const chocan = (aIni: Date, aFin: Date, bIni: Date, bFin: Date): boolean =>
  aIni < bFin && bIni < aFin

/**
 * Huecos libres de un dia, respetando lo que ya hay en el calendario.
 *
 * Los eventos de dia completo no bloquean nada: un cumpleanos marcado asi no
 * significa que no puedas estudiar esa tarde.
 */
function huecosDelDia(dia: Date, eventos: CalendarEvent[]): { inicio: Date; fin: Date }[] {
  const ocupado = eventos
    .filter((e) => !e.allDay)
    .map((e) => ({ inicio: new Date(e.start), fin: new Date(e.end) }))
    .filter((e) => !Number.isNaN(e.inicio.getTime()) && !Number.isNaN(e.fin.getTime()))

  const huecos: { inicio: Date; fin: Date }[] = []
  const ahora = new Date()

  for (let hora = HORA_INICIO; hora + BLOQUE_MIN / 60 <= HORA_FIN; ) {
    const inicio = new Date(dia)
    inicio.setHours(Math.floor(hora), (hora % 1) * 60, 0, 0)
    const fin = new Date(inicio.getTime() + BLOQUE_MIN * 60_000)

    if (fin.getHours() > HORA_FIN || (fin.getHours() === HORA_FIN && fin.getMinutes() > 0)) break

    // Nada de proponer bloques en el pasado.
    if (fin <= ahora) {
      hora += 0.5
      continue
    }

    if (!ocupado.some((o) => chocan(inicio, fin, o.inicio, o.fin))) {
      huecos.push({ inicio, fin })
      hora += (BLOQUE_MIN + DESCANSO_MIN) / 60
    } else {
      hora += 0.5
    }
  }

  return huecos
}

/**
 * Cuantos bloques merece cada cosa.
 *
 * No se intenta adivinar el esfuerzo real: no hay dato para eso, y fingir
 * precision seria peor que repartir de forma sencilla y dejar que el usuario
 * ajuste en la confirmacion.
 *
 * Los examenes se llevan mas porque no se pueden hacer la noche antes: una
 * entrega se termina de una sentada, un examen necesita repasos repartidos.
 */
function bloquesPorTarea(tarea: BriefTask): number {
  const examen = tarea.source === 'examen'
  if (!tarea.dueDate) return 1

  const dias = Math.ceil((Date.parse(tarea.dueDate) - Date.now()) / 86_400_000)
  if (examen) return dias <= 3 ? 3 : 2
  return dias <= 3 ? 2 : 1
}

/**
 * Desempate cuando dos cosas caen el mismo dia: primero el examen.
 *
 * Si el viernes hay un examen y una entrega, el tiempo de estudio va antes al
 * examen. La entrega se puede rematar el jueves por la noche; el examen no.
 */
const prioridad = (t: BriefTask): number => (t.source === 'examen' ? 0 : 1)

/**
 * Clave de dia en hora local.
 *
 * Cortar la cadena ISO daria el dia en UTC, y una entrega a la una de la
 * madrugada caeria en el dia anterior.
 */
function diaLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** Todo lo que compite por tiempo de estudio, ordenado por urgencia. */
async function pendientes(fuentes: FuentesPlanificador): Promise<BriefTask[]> {
  const propias: BriefTask[] = fuentes.tasks
    .list()
    .filter((t) => !t.done)
    .map((t) => ({
      title: t.title,
      subject: t.subject,
      dueDate: t.dueDate,
      source: 'manual' as const
    }))

  // Los ya corregidos no entran: estudiar para un examen que ya tiene nota no
  // sirve de nada.
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const examenes: BriefTask[] = fuentes.examenes
    .list()
    .filter((e) => e.grade === null && Date.parse(e.date) >= hoy.getTime())
    .map((e) => ({
      title: e.title,
      subject: e.subject,
      dueDate: e.date,
      source: 'examen' as const
    }))

  let deClassroom: BriefTask[] = []
  try {
    deClassroom = (await fuentes.classroom.listPending()).map((a) => ({
      title: a.title,
      subject: a.courseName,
      dueDate: a.dueDate,
      source: 'classroom' as const
    }))
  } catch {
    // Classroom puede estar bloqueado por el centro; no impide planificar.
  }

  return [...examenes, ...propias, ...deClassroom].sort((a, b) => {
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1

    // Se compara el dia, no el instante: una entrega a las 23:59 y un examen a
    // las 9:00 del mismo dia son "el mismo dia", y ahi manda el examen.
    const diaA = diaLocal(a.dueDate)
    const diaB = diaLocal(b.dueDate)
    if (diaA !== diaB) return diaA.localeCompare(diaB)
    return prioridad(a) - prioridad(b)
  })
}

export async function calcular(dias: number, fuentes: FuentesPlanificador): Promise<Bloque[]> {
  const desde = new Date()
  desde.setHours(0, 0, 0, 0)
  const hasta = new Date(desde)
  hasta.setDate(hasta.getDate() + dias)

  const [eventos, tareas] = await Promise.all([
    // Sin calendario, todas las horas cuentan como libres: es mejor proponer
    // algo revisable que no proponer nada.
    fuentes.calendar.listEvents(desde.toISOString(), hasta.toISOString()).catch(() => []),
    pendientes(fuentes)
  ])

  if (tareas.length === 0) return []

  const cola: BriefTask[] = []
  for (const t of tareas) {
    for (let i = 0; i < bloquesPorTarea(t); i++) cola.push(t)
  }

  const bloques: Bloque[] = []

  for (let d = 0; d < dias && cola.length > 0; d++) {
    const dia = new Date(desde)
    dia.setDate(dia.getDate() + d)

    const delDia = eventos.filter((e) => new Date(e.start).toDateString() === dia.toDateString())

    for (const hueco of huecosDelDia(dia, delDia)) {
      if (cola.length === 0) break

      // Se busca la primera tarea de la cola que aun se pueda estudiar en ese
      // hueco: si el bloque cae despues de la entrega, no sirve de nada.
      const indice = cola.findIndex(
        (t) => !t.dueDate || hueco.fin.getTime() <= Date.parse(t.dueDate)
      )
      if (indice === -1) continue

      const [tarea] = cola.splice(indice, 1)
      bloques.push({
        inicio: hueco.inicio,
        fin: hueco.fin,
        tarea: tarea.title,
        asignatura: tarea.subject
      })
    }
  }

  return bloques
}
