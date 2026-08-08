/**
 * The OAuth credentials packaged with the application.
 *
 * They come from `.env` and electron-vite injects them at build time: any
 * variable prefixed `MAIN_VITE_` ends up inside the main-process bundle. The
 * `.env` is gitignored, so the secret never enters the repository, but the
 * binary does carry it and the user only has to press Connect.
 *
 * On shipping a "secret" inside the app: in a desktop client it is not really
 * a secret, and Google assumes as much. That is why the flow uses PKCE, where
 * the
 * security comes from the `code_verifier` generated on each sign-in, which
 * never leaves the machine. Without that verifier, having these strings allows
 * nobody to get into anybody's account.
 *
 * Anyone who wants to use their own Google Cloud project can override them
 * from Settings; whatever is saved there wins over this.
 */

const leer = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '')

export const CREDENCIALES_EMPAQUETADAS = {
  clientId: leer(import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID),
  clientSecret: leer(import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET)
}

/** True if the app ships with credentials and nothing needs configuring. */
export const traeCredenciales = (): boolean =>
  CREDENCIALES_EMPAQUETADAS.clientId.length > 0 &&
  CREDENCIALES_EMPAQUETADAS.clientSecret.length > 0
