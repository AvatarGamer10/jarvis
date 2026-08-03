/**
 * Credenciales de OAuth que se empaquetan con la aplicacion.
 *
 * Vienen del `.env` y las inyecta electron-vite al compilar: cualquier variable
 * con prefijo `MAIN_VITE_` acaba dentro del bundle del proceso principal. El
 * `.env` esta en .gitignore, asi que el secreto nunca entra en el repositorio,
 * pero el binario si lo lleva y el usuario solo tiene que pulsar "Conectar".
 *
 * Sobre llevar un "secreto" dentro de la app: en un cliente de escritorio no es
 * un secreto de verdad y Google lo asume. Por eso el flujo usa PKCE, donde la
 * seguridad viene del `code_verifier` que se genera en cada inicio de sesion y
 * nunca sale del equipo. Sin ese verificador, tener estas cadenas no permite
 * entrar en la cuenta de nadie.
 *
 * Quien quiera usar su propio proyecto de Google Cloud puede sobreescribirlas
 * desde Ajustes; lo que se guarde ahi manda sobre esto.
 */

const leer = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '')

export const CREDENCIALES_EMPAQUETADAS = {
  clientId: leer(import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID),
  clientSecret: leer(import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET)
}

/** True si la app trae credenciales y el usuario no necesita configurar nada. */
export const traeCredenciales = (): boolean =>
  CREDENCIALES_EMPAQUETADAS.clientId.length > 0 &&
  CREDENCIALES_EMPAQUETADAS.clientSecret.length > 0
