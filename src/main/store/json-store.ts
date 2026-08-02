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
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    fs.renameSync(tmp, this.file)
  }
}
