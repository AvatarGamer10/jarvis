/**
 * Que hay de nuevo en cada version.
 *
 * Va escrito aqui y no se descarga del release de GitHub por dos razones: se ve
 * al instante y sin conexion, y sobre todo, despues de actualizar la app ya no
 * esta hablando con el actualizador. Pedirle a GitHub las notas de la version
 * que ya tienes instalada seria una llamada de red para recuperar algo que
 * podia haber venido dentro.
 *
 * Se escribe para quien la usa, no para quien la programa.
 */

export interface Novedad {
  version: string
  titulo: string
  puntos: string[]
}

/** De la mas reciente a la mas antigua. */
export const NOVEDADES: Novedad[] = [
  {
    version: '1.0.0',
    titulo: 'JARVIS 1.0',
    puntos: [
      'Nueva seccion Notas: apunta tus examenes, guarda las notas y mira la media de cada asignatura. Si pones cuanto cuenta cada examen, te dice que necesitas sacar en lo que queda para aprobar.',
      'La agenda ahora es una rejilla de lunes a domingo. Se ven los huecos libres de un vistazo, que es lo que el planificador usa para repartir el estudio.',
      'El planificador le da prioridad a los examenes: si el viernes tienes examen y entrega, el tiempo de estudio va antes al examen.',
      'Boton «Pegar desde Classroom»: copia la lista de la web, pegala y te la convierto en tareas. Las revisas antes de que se guarden.',
      'Ctrl+K abre un buscador de todo, y Ctrl+1 a Ctrl+7 saltan a cada seccion sin pasar por el menu.',
      'Al apuntar algo: botones de Hoy, Manana y Viernes; se puede editar sin borrar y volver a crear; y si borras por error, aparece un «Deshacer».',
      'Ajustes esta repartido en pestanas, y la app se abre donde la dejaste.'
    ]
  }
]

/** Compara dos versiones tipo "1.2.3". Devuelve <0, 0 o >0. */
export function compararVersiones(a: string, b: string): number {
  const partes = (v: string): number[] =>
    v.split('.').map((n) => Number.parseInt(n, 10) || 0)

  const va = partes(a)
  const vb = partes(b)

  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const diferencia = (va[i] ?? 0) - (vb[i] ?? 0)
    if (diferencia !== 0) return diferencia
  }
  return 0
}

/**
 * Que novedades tocan ensenar.
 *
 * Se guarda la ultima version que el usuario ya ha visto, no solo la anterior:
 * si alguien se salta dos versiones, se le ensenan las dos y no solo la ultima.
 */
export function novedadesPendientes(
  versionActual: string,
  versionVista: string,
  onboardingHecho: boolean,
  catalogo: Novedad[] = NOVEDADES
): Novedad[] {
  // Instalacion nueva: la pantalla de bienvenida ya cuenta lo que hay, y
  // recibir ademas un "que hay de nuevo" de algo que acabas de instalar no
  // tiene sentido.
  if (!versionVista && !onboardingHecho) return []

  // Quien ya usaba JARVIS antes de que existiera esta pantalla no tiene version
  // guardada. Se le ensena lo de la version a la que acaba de subir, que es lo
  // unico que se puede afirmar con certeza que no ha visto.
  if (!versionVista) {
    return catalogo.filter((n) => compararVersiones(n.version, versionActual) === 0)
  }

  return catalogo.filter(
    (n) =>
      compararVersiones(n.version, versionVista) > 0 &&
      compararVersiones(n.version, versionActual) <= 0
  )
}
