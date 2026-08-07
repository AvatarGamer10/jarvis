/**
 * Convierte una lista pegada de Classroom en tareas.
 *
 * Existe porque el centro no aprueba la aplicacion y la API esta cerrada, pero
 * copiar y pegar la pantalla si funciona siempre. El modelo local hace este
 * mismo trabajo mejor cuando esta disponible; esto es lo que responde cuando no
 * lo esta, y ademas sirve de referencia para comparar.
 *
 * Puro y sin dependencias: se prueba sin Electron ni modelo.
 */

export interface TareaPegada {
  titulo: string
  asignatura: string
  /** ISO 8601, o null si en el texto no habia fecha. */
  entrega: string | null
}

/** Tope por pegada. Nadie tiene 40 tareas; mas que eso es texto de mas. */
const MAX_TAREAS = 40

/** Longitud maxima de una linea para que pueda ser una asignatura. */
const MAX_ASIGNATURA = 45

const MESES: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6
}

/**
 * Minusculas y sin tildes, conservando la longitud.
 *
 * No se usa normalize('NFD'): descompone las tildes en dos caracteres y las
 * posiciones dejarian de coincidir con el texto original, que es de donde hay
 * que recortar la fecha para quedarse con el titulo.
 */
const TILDES: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', ç: 'c'
}
const normalizar = (texto: string): string =>
  texto.toLowerCase().replace(/[áéíóúüñç]/g, (c) => TILDES[c])

/**
 * Lineas que Classroom mete alrededor de cada tarea y que no son tareas.
 *
 * "Publicado" y "asignado" llevan fecha propia, y es la de publicacion: si se
 * dejara pasar la linea, esa fecha acabaria puesta como fecha de entrega.
 */
const RUIDO = [
  'publicado',
  'asignado',
  'ver detalles',
  'ver tarea',
  'trabajo de clase',
  'sin fecha de entrega',
  'sin entregar',
  'entregado',
  'devuelto',
  'con retraso',
  'falta',
  'todo',
  'proximos',
  'tareas pendientes',
  'ver todo'
]

const esRuido = (linea: string): boolean => {
  const n = normalizar(linea).trim()
  if (n.length === 0) return true
  // Numeros sueltos y separadores.
  if (/^[\d\s./·|—–-]+$/.test(n)) return true
  // Contadores de Classroom: "3 de 5".
  if (/^\d{1,3}\s+de\s+\d{1,3}$/.test(n)) return true
  return RUIDO.some((r) => n === r || n.startsWith(`${r} `) || n.includes(r))
}

/**
 * Etiquetas que preceden a la fecha y que no forman parte del titulo.
 *
 * Se recortan del texto original, que viene con mayusculas ("Fecha de
 * entrega:"), de ahi la `i`. Sin ella solo casaba el "entrega" suelto del
 * final y el titulo se quedaba en "Fecha de".
 */
const ETIQUETAS = /\b(fecha de entrega|fecha limite|entrega|vence|para el)\s*:?\s*/gi

interface FechaEncontrada {
  fecha: Date | null
  /** Lo que queda de la linea despues de quitar la fecha y su etiqueta. */
  resto: string
}

/**
 * Saca la fecha de una linea y devuelve el resto.
 *
 * Se prueban los formatos de mas explicito a menos, porque "8/8" tambien casa
 * dentro de "8/8/2026" y quedarse con el primero perderia el ano.
 */
export function extraerFecha(linea: string, hoy: Date = new Date()): FechaEncontrada {
  const n = normalizar(linea)

  const patrones: { re: RegExp; construir: (m: RegExpExecArray) => Date | null }[] = [
    // 8 de agosto de 2026 · 8 ago · 8 de ago.
    {
      re: /\b(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?(?:\s*(?:de\s*)?(\d{4}))?/,
      construir: (m) => conAno(Number(m[1]), MESES[m[2]], m[3] ? Number(m[3]) : null, hoy)
    },
    // 8/8/2026 · 08-08-26 · 8/8
    {
      re: /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/,
      construir: (m) => {
        const ano = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null
        return conAno(Number(m[1]), Number(m[2]) - 1, ano, hoy)
      }
    },
    {
      re: /\b(pasado manana|manana|hoy)\b/,
      construir: (m) => {
        const d = aMedianoche(hoy)
        d.setDate(d.getDate() + (m[1] === 'hoy' ? 0 : m[1] === 'manana' ? 1 : 2))
        return d
      }
    },
    {
      re: /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/,
      construir: (m) => proximoDiaSemana(DIAS_SEMANA[m[1]], hoy)
    }
  ]

  for (const { re, construir } of patrones) {
    const m = re.exec(n)
    if (!m) continue

    const fecha = construir(m)
    if (!fecha) continue

    // Se recorta del texto original, no del normalizado: las posiciones
    // coinciden porque normalizar conserva la longitud.
    const resto = (linea.slice(0, m.index) + linea.slice(m.index + m[0].length))
      .replace(ETIQUETAS, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s·•|—–-]+|[\s·•|—–-]+$/g, '')
      .trim()

    return { fecha, resto }
  }

  return { fecha: null, resto: linea.replace(ETIQUETAS, ' ').trim() }
}

const aMedianoche = (fecha: Date): Date => {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Completa el ano cuando el texto no lo trae.
 *
 * Classroom escribe "15 ene" sin ano. Usar siempre el actual pondria esa fecha
 * once meses en el pasado si estamos en diciembre, asi que una fecha que queda
 * muy atras se entiende como del ano que viene.
 */
function conAno(dia: number, mes: number, ano: number | null, hoy: Date): Date | null {
  if (dia < 1 || dia > 31 || mes < 0 || mes > 11) return null

  const candidata = new Date(ano ?? hoy.getFullYear(), mes, dia)
  candidata.setHours(0, 0, 0, 0)
  if (candidata.getMonth() !== mes) return null // 31 de febrero y compania

  if (ano === null) {
    const haceDosMeses = new Date(hoy)
    haceDosMeses.setMonth(haceDosMeses.getMonth() - 2)
    if (candidata < haceDosMeses) candidata.setFullYear(candidata.getFullYear() + 1)
  }

  return candidata
}

/** El proximo dia de la semana con ese nombre. Hoy cuenta como proximo. */
function proximoDiaSemana(objetivo: number, hoy: Date): Date {
  const d = aMedianoche(hoy)
  d.setDate(d.getDate() + ((objetivo - d.getDay() + 7) % 7))
  return d
}

/** Al final del dia: es cuando vence una entrega. */
function comoEntrega(fecha: Date): string {
  const d = new Date(fecha)
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}

const SEPARADORES = /\s*[·•|—–]\s*|\s+-\s+/

/**
 * Interpreta el texto pegado.
 *
 * Classroom coloca cada tarea en varias lineas seguidas, normalmente titulo,
 * asignatura y fecha, pero no siempre las tres ni siempre en ese orden. Las
 * reglas son a proposito pocas y explicables:
 *
 * - Una linea con fecha y texto es una tarea nueva.
 * - Una linea que solo tiene fecha completa la tarea anterior.
 * - Una linea corta y sin fecha, justo detras de una tarea a la que aun no se
 *   le ha puesto fecha, se toma como su asignatura.
 *
 * La ultima regla es la que puede fallar: dos titulos seguidos sin fecha hacen
 * que el segundo pase por asignatura del primero. Por eso nada de esto se
 * guarda sin que el usuario lo vea y lo pueda corregir antes.
 */
export function interpretarTexto(texto: string, hoy: Date = new Date()): TareaPegada[] {
  const tareas: TareaPegada[] = []

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim()
    if (linea.length === 0 || esRuido(linea)) continue

    const { fecha, resto } = extraerFecha(linea, hoy)
    const ultima = tareas[tareas.length - 1]

    // Solo fecha: es de la tarea de arriba.
    if (resto.length === 0) {
      if (fecha && ultima && ultima.entrega === null) ultima.entrega = comoEntrega(fecha)
      continue
    }

    const partes = resto.split(SEPARADORES).map((p) => p.trim()).filter(Boolean)
    const titulo = partes[0]
    const asignatura = partes[1] ?? ''

    const esAsignaturaDeLaAnterior =
      !fecha &&
      partes.length === 1 &&
      titulo.length <= MAX_ASIGNATURA &&
      ultima !== undefined &&
      ultima.asignatura === '' &&
      ultima.entrega === null

    if (esAsignaturaDeLaAnterior) {
      ultima.asignatura = titulo
      continue
    }

    if (tareas.length >= MAX_TAREAS) break

    tareas.push({
      titulo,
      asignatura,
      entrega: fecha ? comoEntrega(fecha) : null
    })
  }

  return tareas
}
