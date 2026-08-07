import type { Examen, Necesario, ResumenAsignatura } from '@shared/types'

/**
 * Medias y ponderaciones. Puro, sin dependencias del resto de la app.
 *
 * Vive aparte del servicio porque el servicio arrastra el almacen en disco, que
 * no compila fuera de Electron. Y porque esto es lo unico de examenes que
 * conviene tener cubierto por pruebas: una media mal calculada no da error, da
 * un numero equivocado, que es peor.
 */

/** Nota minima para aprobar en el sistema espanol. */
export const APROBADO = 5

/** Notas validas. Fuera de este rango es un error de tecleo, no una nota. */
export const NOTA_MIN = 0
export const NOTA_MAX = 10

const redondear = (n: number): number => Math.round(n * 100) / 100

export const estaHecho = (e: Examen): boolean => e.grade !== null

/**
 * Media de un conjunto de examenes.
 *
 * Con pesos se pondera; sin ellos se hace la media simple. Si unos llevan peso
 * y otros no, se usa la simple: mezclar seria inventarse el peso que falta y
 * dar un numero con pinta de exacto que no lo es.
 */
export function media(examenes: Examen[]): { valor: number | null; ponderada: boolean } {
  const hechos = examenes.filter(estaHecho)
  if (hechos.length === 0) return { valor: null, ponderada: false }

  const todosConPeso = hechos.every((e) => e.weight !== null && e.weight > 0)
  const pesoTotal = hechos.reduce((suma, e) => suma + (e.weight ?? 0), 0)

  if (todosConPeso && pesoTotal > 0) {
    const puntos = hechos.reduce((suma, e) => suma + (e.grade as number) * (e.weight as number), 0)
    return { valor: redondear(puntos / pesoTotal), ponderada: true }
  }

  const suma = hechos.reduce((total, e) => total + (e.grade as number), 0)
  return { valor: redondear(suma / hechos.length), ponderada: false }
}

/**
 * Que media hace falta en los examenes que quedan para llegar al objetivo.
 *
 * Solo tiene sentido si todos los examenes de la asignatura llevan peso: sin
 * saber cuanto vale lo que queda, no hay cuenta que hacer.
 *
 * No se exige que los pesos sumen 100. Si alguien apunta 30/30/30 la cuenta
 * sigue siendo correcta sobre ese total, y avisarle de que le falta un 10%
 * seria regañarle por no haber terminado de apuntar.
 */
export function necesarioPara(examenes: Examen[], objetivo = APROBADO): Necesario | null {
  const conPeso = examenes.every((e) => e.weight !== null && e.weight > 0)
  if (!conPeso || examenes.length === 0) return null

  const pendientes = examenes.filter((e) => !estaHecho(e))
  if (pendientes.length === 0) return null

  // Sin ninguna nota todavia la respuesta siempre seria "necesitas un 5", que
  // es la definicion de aprobar. Decirlo no informa de nada.
  if (pendientes.length === examenes.length) return null

  const pesoTotal = examenes.reduce((suma, e) => suma + (e.weight as number), 0)
  const pesoPendiente = pendientes.reduce((suma, e) => suma + (e.weight as number), 0)
  if (pesoPendiente <= 0) return null

  const conseguidos = examenes
    .filter(estaHecho)
    .reduce((suma, e) => suma + (e.grade as number) * (e.weight as number), 0)

  // Puntos que faltan, en la misma escala en la que estan los pesos.
  const faltan = objetivo * pesoTotal - conseguidos

  if (faltan <= 0) return { estado: 'asegurado' }

  const nota = faltan / pesoPendiente
  if (nota > NOTA_MAX) return { estado: 'imposible' }

  return { estado: 'necesita', nota: redondear(nota) }
}

/**
 * Un resumen por asignatura, ordenado por nombre.
 *
 * Las asignaturas se agrupan sin distinguir mayusculas ni acentos: quien apunta
 * "fisica" un dia y "Física" otro espera una sola asignatura, no dos medias a
 * la mitad. Se conserva como nombre el primero que se escribio.
 */
export function porAsignatura(examenes: Examen[], objetivo = APROBADO): ResumenAsignatura[] {
  const grupos = new Map<string, { nombre: string; examenes: Examen[] }>()

  for (const e of examenes) {
    const nombre = e.subject.trim() || 'Sin asignatura'
    const clave = nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')

    const grupo = grupos.get(clave)
    if (grupo) grupo.examenes.push(e)
    else grupos.set(clave, { nombre, examenes: [e] })
  }

  return [...grupos.values()]
    .map(({ nombre, examenes: delGrupo }) => {
      const { valor, ponderada } = media(delGrupo)
      return {
        asignatura: nombre,
        media: valor,
        ponderada,
        hechos: delGrupo.filter(estaHecho).length,
        pendientes: delGrupo.filter((e) => !estaHecho(e)).length,
        necesario: necesarioPara(delGrupo, objetivo)
      }
    })
    .sort((a, b) => a.asignatura.localeCompare(b.asignatura, 'es'))
}

/**
 * Examenes que aun no han pasado, del mas cercano al mas lejano.
 *
 * Se mira el dia natural, no el instante: un examen a las 9 de la manana sigue
 * contando como "hoy" durante toda la jornada.
 */
export function proximos(examenes: Examen[], desde = new Date()): Examen[] {
  const hoy = new Date(desde)
  hoy.setHours(0, 0, 0, 0)

  return examenes
    .filter((e) => {
      const fecha = Date.parse(e.date)
      return !Number.isNaN(fecha) && fecha >= hoy.getTime()
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
