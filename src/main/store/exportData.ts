import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * Exports and imports the user's data as a single file.
 *
 * Everything you write down lives in a handful of JSON files inside the data
 * folder. Without a way to get them out, changing computer — or recovering
 * from an accidental delete — means losing all of it.
 *
 * Secrets do NOT travel in the file. Credentials are encrypted with the
 * machine's keychain and cannot be decrypted on another one, so including them
 * would export unreadable rubbish; and a backup file with your Google session
 * inside is exactly what you do not want sitting in a shared folder.
 */

/** The user's data files. `credentials.bin` is left out on purpose. */
const FILES = [
  'tasks.json',
  'exams.json',
  'organizer-rules.json',
  'organizer-journal.json',
  'chat.json'
]

const VERSION = 1

interface Backup {
  version: number
  application: string
  exportedAt: string
  data: Record<string, unknown>
}

export function exportData(destination: string): { files: number } {
  const folder = app.getPath('userData')
  const data: Record<string, unknown> = {}

  for (const name of FILES) {
    const file = path.join(folder, name)
    if (!fs.existsSync(file)) continue
    try {
      data[name] = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      // One corrupt file cannot stop the others being saved.
      console.error(`[backup] ${name} is unreadable:`, err)
    }
  }

  const backup: Backup = {
    version: VERSION,
    application: `Vilo ${app.getVersion()}`,
    exportedAt: new Date().toISOString(),
    data
  }

  fs.writeFileSync(destination, JSON.stringify(backup, null, 2), 'utf8')
  return { files: Object.keys(data).length }
}

export function importData(source: string): { files: number } {
  const raw = fs.readFileSync(source, 'utf8')

  let backup: Backup
  try {
    backup = JSON.parse(raw) as Backup
  } catch {
    throw new Error('That file is not a Vilo backup.')
  }

  if (typeof backup.version !== 'number' || !backup.data) {
    throw new Error('That file is not a Vilo backup.')
  }
  if (backup.version > VERSION) {
    throw new Error('That backup comes from a newer version of Vilo.')
  }

  const folder = app.getPath('userData')
  let written = 0

  for (const [name, contents] of Object.entries(backup.data)) {
    // Only known files are restored: without this check a tampered backup
    // could write anywhere it liked inside the data folder.
    if (!FILES.includes(name)) continue

    const file = path.join(folder, name)
    // Whatever was there is kept beside it before being overwritten.
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, `${file}.before-import`)
    }
    fs.writeFileSync(file, JSON.stringify(contents, null, 2), 'utf8')
    written++
  }

  return { files: written }
}

/** Suggested name, dated so two backups never overwrite each other. */
export function suggestedBackupName(): string {
  return `vilo-backup-${new Date().toISOString().slice(0, 10)}.json`
}
