import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * A minimal JSON store on disk. The volume here is a few hundred records, so
 * it is not worth a database, nor a native module that would have to be
 * recompiled for every platform.
 *
 * Writes are atomic (temp file plus rename) so that losing power mid-write
 * cannot leave the file half-written.
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
      // Merged with the defaults so that adding a field in a future version
      // does not leave older files without it.
      return { ...structuredClone(this.defaults), ...parsed }
    } catch (err) {
      console.error(`[store] ${this.file} is unreadable; falling back to defaults:`, err)
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

  /**
   * Back to factory values.
   *
   * It goes through persist(), so the previous file is backed up into
   * `backups/` like any other write: if somebody presses this by accident,
   * yesterday's is still there.
   */
  reset(): T {
    this.data = structuredClone(this.defaults)
    this.persist()
    return this.data
  }

  private persist(): void {
    const dir = path.dirname(this.file)
    fs.mkdirSync(dir, { recursive: true })

    this.backup()

    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    fs.renameSync(tmp, this.file)
  }

  /**
   * Keeps a copy of the previous file before overwriting it.
   *
   * One copy per day, not one per write: writing hundreds of identical copies
   * in an afternoon protects against nothing and fills the disk. What is
   * actually needed is being able to get back to how things were yesterday, if
   * something was corrupted or deleted by accident today.
   */
  private backup(): void {
    if (!fs.existsSync(this.file)) return

    const folder = path.join(path.dirname(this.file), 'backups')
    const name = path.basename(this.file, '.json')
    const today = new Date().toISOString().slice(0, 10)
    const destination = path.join(folder, `${name}-${today}.json`)

    try {
      if (fs.existsSync(destination)) return
      fs.mkdirSync(folder, { recursive: true })
      fs.copyFileSync(this.file, destination)
      this.prune(folder, name)
    } catch (err) {
      // A failed backup cannot stop the new data being saved.
      console.error('[store] could not back up:', err)
    }
  }

  /** Leaves only the most recent copies. */
  private prune(folder: string, name: string): void {
    const copies = fs
      .readdirSync(folder)
      .filter((f) => f.startsWith(`${name}-`) && f.endsWith('.json'))
      .sort()

    for (const old of copies.slice(0, Math.max(0, copies.length - JsonStore.KEPT_DAYS))) {
      fs.rmSync(path.join(folder, old), { force: true })
    }
  }

  /** Days of history kept. */
  private static readonly KEPT_DAYS = 14
}
