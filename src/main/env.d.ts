/**
 * The environment variables electron-vite injects into the main process.
 *
 * Only those starting `MAIN_VITE_` reach this far; the rest of the `.env` stays
 * out of the bundle. They are declared optional on purpose: if somebody builds
 * without a `.env`, the app still runs and asks for the credentials in
 * Ajustes en lugar de romper al arrancar.
 *
 * No `import` or `export` in this file: it has to be a global script so the
 * interface merges with the one electron-vite already ships.
 */
interface ImportMetaEnv {
  readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string
  readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
