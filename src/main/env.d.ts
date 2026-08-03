/**
 * Variables de entorno que electron-vite inyecta en el proceso principal.
 *
 * Solo las que empiezan por `MAIN_VITE_` llegan hasta aqui; el resto del `.env`
 * se queda fuera del bundle. Se declaran opcionales a proposito: si alguien
 * compila sin `.env`, la app sigue funcionando y pide las credenciales en
 * Ajustes en lugar de romper al arrancar.
 *
 * Sin `import` ni `export` en este fichero: tiene que ser un script global para
 * que la interfaz se fusione con la que ya trae electron-vite.
 */
interface ImportMetaEnv {
  readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string
  readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
