import { nativeImage, type NativeImage } from 'electron'

/**
 * Icono de bandeja dibujado por codigo.
 *
 * Mismo criterio que los sonidos: sin ficheros que empaquetar, sin depender de
 * que alguien exporte un PNG al tamano correcto, y afinable al pixel. Dibuja el
 * motivo del anillo, que es la identidad de la app.
 *
 * `createFromBitmap` espera los pixeles en orden BGRA.
 */

const SIZE = 32
const CANALES = 4

/** Azul de marca, el mismo que usa la interfaz para lo interactivo. */
const AZUL = { r: 0x3d, g: 0x8f, b: 0xd6 }

/**
 * Cobertura suavizada de un anillo en un punto.
 *
 * Devuelve 1 dentro, 0 fuera y un valor intermedio en el borde. Sin esto el
 * icono sale con los bordes dentados, que a 32 px canta muchisimo.
 */
function coberturaAnillo(
  distancia: number,
  radioExterior: number,
  radioInterior: number
): number {
  const suavizado = 1
  const fuera = Math.min(1, Math.max(0, (radioExterior - distancia) / suavizado))
  const dentro = Math.min(1, Math.max(0, (distancia - radioInterior) / suavizado))
  return Math.min(fuera, dentro)
}

export function crearIconoBandeja(): NativeImage {
  const buffer = Buffer.alloc(SIZE * SIZE * CANALES)
  const centro = (SIZE - 1) / 2

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - centro
      const dy = y - centro
      const distancia = Math.hypot(dx, dy)

      // Anillo exterior y punto central: el mismo motivo del menu radial.
      const anillo = coberturaAnillo(distancia, 15, 11)
      const nucleo = Math.min(1, Math.max(0, (5 - distancia) / 1))
      const alfa = Math.min(1, anillo + nucleo)

      const i = (y * SIZE + x) * CANALES
      buffer[i] = AZUL.b
      buffer[i + 1] = AZUL.g
      buffer[i + 2] = AZUL.r
      buffer[i + 3] = Math.round(alfa * 255)
    }
  }

  return nativeImage.createFromBitmap(buffer, { width: SIZE, height: SIZE })
}
