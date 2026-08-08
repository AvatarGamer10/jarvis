/**
 * Que hay de nuevo en cada version.
 *
 * Written here rather than fetched from the GitHub release for two reasons: it
 * shows
 * instantly and offline and, above all, after updating the app is no longer
 * is talking to the updater. Asking GitHub for the notes of the version you
 * already have installed would be a network call to fetch something that
 * podia haber venido dentro.
 *
 * Written for whoever uses it, not for whoever programmed it.
 */

export interface ReleaseNote {
  version: string
  title: string
  points: string[]
}

/** Newest first, oldest last. */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '2.0.0',
    title: 'Say hello to Vilo',
    points: [
      'JARVIS is now Vilo, and the whole interface has been rebuilt from scratch — one quiet grey, clean white type, and everything animated.',
      'The app is in English. A language picker for Spanish, French and German is coming in a later release.',
      'A new voice screen built around a living orb: it moves with your voice, and the answer rises into place word by word as it is spoken.',
      'You no longer need to host a model yourself. Add an OpenRouter key and Vilo works in a minute — Gemini and Ollama are still there if you prefer them.',
      'A sidebar replaces the old ring menu, so everything is one click away. ⌘K still jumps anywhere, and ⌘1–7 go straight to a section.',
      'Homework from Classroom and the tasks you write down are now one list, sorted by what is due first.',
      'The floating orb is back, and now shows what it says as it says it.'
    ]
  },
  {
    version: '1.0.0',
    title: 'JARVIS 1.0',
    points: [
      'New Grades section: record your exams, keep your marks, and see the average for each subject. Add what each exam is worth and it tells you what you need in what is left to pass.',
      'The calendar is now a Monday-to-Sunday grid. Free gaps show at a glance, which is exactly what the planner uses to spread out your study.',
      'The planner puts exams first: if you have an exam and a deadline on Friday, study time goes to the exam.',
      '"Paste from Classroom": copy the list off the website, paste it in, and it becomes tasks. You review them before anything is saved.',
      'Ctrl+K opens a search for everything, and Ctrl+1 to Ctrl+7 jump straight to a section.',
      'When writing something down: Today, Tomorrow and Friday buttons; edit in place instead of deleting and recreating; and an Undo when you delete by mistake.'
    ]
  }
]

/** Compara dos versiones tipo "1.2.3". Devuelve <0, 0 o >0. */
export function compareVersions(a: string, b: string): number {
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
 * Que whatsNew tocan ensenar.
 *
 * The last version the user has actually seen is stored, not simply the
 * previous one: if somebody skips two versions, they are shown both rather
 * than only the latest.
 */
export function whatsNewPending(
  versionActual: string,
  versionVista: string,
  onboardingHecho: boolean,
  catalogo: ReleaseNote[] = RELEASE_NOTES
): ReleaseNote[] {
  // A fresh install: the welcome screen already covers what is here, and
  // getting a "what's new" for something you have just installed on top of it
  // tiene sentido.
  if (!versionVista && !onboardingHecho) return []

  // Anybody using the app before this screen existed has no stored version.
  // They are shown the notes for the version they have just moved to, which is
  // the only thing we can say with certainty they have not seen.
  if (!versionVista) {
    return catalogo.filter((n) => compareVersions(n.version, versionActual) === 0)
  }

  return catalogo.filter(
    (n) =>
      compareVersions(n.version, versionVista) > 0 &&
      compareVersions(n.version, versionActual) <= 0
  )
}
