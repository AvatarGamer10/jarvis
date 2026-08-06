import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * Almacen JSON minimo sobre disco. El volumen de datos aqui es de unos pocos
 * cientos de registros, asi que no compensa una base de datos ni un modulo
 * nativo que haya que recompilar para cada plataforma.
 *
 * Las escrituras son atomicas (fichero temporal + rename) para que un corte de
 * luz a media escritura no deje el fichero a medias.
 */
export class JsonStore<T extends object> {
  private readonly file: string
  private data: T

  constructor(filename: string, private readonly defaults: T) {
    this.file = path.join(app.getPath('userData'), filename)
    this.data = this.load()
  }

  private load(): T {
    try {
      if (!fs.existsSync(this.file)) return structuredClone(this.defaults)
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<T>
      // Fusionamos con los defaults para que al anadir campos nuevos en una
      // version futura los ficheros viejos no se queden sin ellos.
      return { ...structuredClone(this.defaults), ...parsed }
    } catch (err) {
      console.error(`[store] ${this.file} ilegible, se usan los valores por defecto:`, err)
      return structuredClone(this.defaults)
    }
  }

  get(): T {
    return this.data
  }

  set(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch }
    this.persist()
    return this.data
  }

  private persist(): void {
    const dir = path.dirname(this.file)
    fs.mkdirSync(dir, { recursive: true })

    this.respaldar()

    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    fs.renameSync(tmp, this.file)
  }

  /**
   * Guarda una copia del fichero anterior antes de sobrescribirlo.
   *
   * Se conserva una copia por dia, no una por escritura: escribir cientos de
   * copias identicas en una tarde no protege de nada y llena el disco. Lo que
   * de verdad hace falta es poder volver a como estaban las cosas ayer, si hoy
   * algo se corrompio o se borro sin querer.
   */
  private respaldar(): void {
    if (!fs.existsSync(this.file)) return

    const carpeta = path.join(path.dirname(this.file), 'copias')
    const nombre = path.basename(this.file, '.json')
    const hoy = new Date().toISOString().slice(0, 10)
    const destino = path.join(carpeta, `${nombre}-${hoy}.json`)

    try {
      if (fs.existsSync(destino)) return
      fs.mkdirSync(carpeta, { recursive: true })
      fs.copyFileSync(this.file, destino)
      this.podar(carpeta, nombre)
    } catch (err) {
      // Que falle el respaldo no puede impedir guardar los datos nuevos.
      console.error('[store] no se pudo respaldar:', err)
    }
  }

  /** Deja solo las copias mas recientes. */
  private podar(carpeta: string, nombre: string): void {
    const copias = fs
      .readdirSync(carpeta)
      .filter((f) => f.startsWith(`${nombre}-`) && f.endsWith('.json'))
      .sort()

    for (const vieja of copias.slice(0, Math.max(0, copias.length - JsonStore.COPIAS))) {
      fs.rmSync(path.join(carpeta, vieja), { force: true })
    }
  }

  /** Dias de historial que se conservan. */
  private static readonly COPIAS = 14
}
