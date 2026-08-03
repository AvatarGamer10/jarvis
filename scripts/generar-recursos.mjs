/**
 * Genera los recursos graficos del instalador y del icono de la app.
 *
 * Se dibujan por codigo en vez de guardarse como ficheros binarios en el
 * repositorio: mismo criterio que el icono de bandeja y que los sonidos. La
 * ventaja practica es que cambiar el color de marca es tocar una constante y
 * volver a ejecutar esto, sin abrir ningun editor de imagen.
 *
 * PNG y BMP se escriben a mano porque son formatos simples: BMP es cabecera
 * mas pixeles en crudo, y PNG es cabecera mas los mismos pixeles pasados por
 * zlib, que ya viene en Node.
 *
 *   node scripts/generar-recursos.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = path.join(RAIZ, 'build')

// --- Paleta, la misma que la interfaz ---------------------------------------

const FONDO_OSCURO = { r: 0x07, g: 0x0c, b: 0x14 }
const FONDO_CLARO = { r: 0x12, g: 0x1e, b: 0x2e }
const AZUL = { r: 0x3d, g: 0x8f, b: 0xd6 }
const NARANJA = { r: 0xf5, g: 0x82, b: 0x1f }

const mezclar = (a, b, t) => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t)
})

const limitar = (v, min, max) => Math.min(max, Math.max(min, v))

// --- PNG ---------------------------------------------------------------------

/** Tabla de CRC32, que es lo que valida cada trozo de un PNG. */
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  return tabla
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function trozo(tipo, datos) {
  const longitud = Buffer.alloc(4)
  longitud.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([longitud, cuerpo, crc])
}

/** `pintar(x, y)` devuelve {r, g, b, a} con a de 0 a 255. */
function crearPng(ancho, alto, pintar) {
  // Cada fila lleva delante un byte de filtro; 0 significa "sin filtrar".
  const crudo = Buffer.alloc(alto * (ancho * 4 + 1))
  let i = 0
  for (let y = 0; y < alto; y++) {
    crudo[i++] = 0
    for (let x = 0; x < ancho; x++) {
      const { r, g, b, a } = pintar(x, y)
      crudo[i++] = r
      crudo[i++] = g
      crudo[i++] = b
      crudo[i++] = a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // color RGBA
  ihdr[10] = 0 // compresion
  ihdr[11] = 0 // filtrado
  ihdr[12] = 0 // sin entrelazado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ])
}

// --- BMP ---------------------------------------------------------------------

/**
 * BMP de 24 bits. NSIS no acepta PNG para el panel lateral ni la cabecera, y
 * tampoco entiende transparencia ahi, asi que estas imagenes son opacas.
 */
function crearBmp(ancho, alto, pintar) {
  // Cada fila se rellena hasta un multiplo de 4 bytes.
  const relleno = (4 - ((ancho * 3) % 4)) % 4
  const tamanoFila = ancho * 3 + relleno
  const tamanoDatos = tamanoFila * alto
  const cabecera = Buffer.alloc(54)

  cabecera.write('BM', 0, 'ascii')
  cabecera.writeUInt32LE(54 + tamanoDatos, 2)
  cabecera.writeUInt32LE(54, 10)
  cabecera.writeUInt32LE(40, 14)
  cabecera.writeInt32LE(ancho, 18)
  cabecera.writeInt32LE(alto, 22)
  cabecera.writeUInt16LE(1, 26)
  cabecera.writeUInt16LE(24, 28)
  cabecera.writeUInt32LE(tamanoDatos, 34)
  cabecera.writeInt32LE(2835, 38)
  cabecera.writeInt32LE(2835, 42)

  const datos = Buffer.alloc(tamanoDatos)
  for (let y = 0; y < alto; y++) {
    // El BMP guarda las filas de abajo arriba.
    const destino = (alto - 1 - y) * tamanoFila
    for (let x = 0; x < ancho; x++) {
      const { r, g, b } = pintar(x, y)
      const i = destino + x * 3
      datos[i] = b
      datos[i + 1] = g
      datos[i + 2] = r
    }
  }

  return Buffer.concat([cabecera, datos])
}

// --- ICO ---------------------------------------------------------------------

/** ICO con un PNG dentro, que es lo que admite Windows desde Vista. */
function crearIco(png, lado) {
  const cabecera = Buffer.alloc(6)
  cabecera.writeUInt16LE(0, 0)
  cabecera.writeUInt16LE(1, 2) // tipo icono
  cabecera.writeUInt16LE(1, 4) // una sola imagen

  const entrada = Buffer.alloc(16)
  entrada[0] = lado >= 256 ? 0 : lado // 0 significa 256
  entrada[1] = lado >= 256 ? 0 : lado
  entrada[2] = 0 // colores de paleta
  entrada[3] = 0
  entrada.writeUInt16LE(1, 4) // planos
  entrada.writeUInt16LE(32, 6) // bits por pixel
  entrada.writeUInt32LE(png.length, 8)
  entrada.writeUInt32LE(22, 12) // desplazamiento hasta los datos

  return Buffer.concat([cabecera, entrada, png])
}

// --- Motivos -----------------------------------------------------------------

/**
 * Cobertura suavizada de un anillo. Devuelve 1 dentro, 0 fuera y valores
 * intermedios en el borde, que es lo que evita los dientes de sierra.
 */
function anillo(distancia, exterior, interior, suavizado = 1.2) {
  const fuera = limitar((exterior - distancia) / suavizado, 0, 1)
  const dentro = limitar((distancia - interior) / suavizado, 0, 1)
  return Math.min(fuera, dentro)
}

/** Fondo de la app: degradado navy con cuadricula muy tenue. */
function fondo(x, y, ancho, alto) {
  const base = mezclar(FONDO_CLARO, FONDO_OSCURO, limitar((x / ancho) * 0.6 + (y / alto) * 0.7, 0, 1))
  // Cuadricula del cuaderno, igual que en la interfaz.
  const enRejilla = x % 23 === 0 || y % 23 === 0
  return enRejilla ? mezclar(base, { r: 255, g: 255, b: 255 }, 0.025) : base
}

/** Anillo con cinco puntos: el mismo motivo del menu radial. */
function dibujarAnillo(color, x, y, cx, cy, radio) {
  const dx = x - cx
  const dy = y - cy
  const distancia = Math.hypot(dx, dy)

  let cobertura = anillo(distancia, radio, radio - Math.max(2, radio * 0.055))
  // Nucleo.
  cobertura = Math.max(cobertura, limitar((radio * 0.2 - distancia) / 1.2, 0, 1))

  let resultado = mezclar(color, AZUL, 0)
  let alfa = cobertura

  // Los cinco satelites, repartidos cada 72 grados desde arriba.
  for (let i = 0; i < 5; i++) {
    const angulo = (-90 + i * 72) * (Math.PI / 180)
    const sx = cx + Math.cos(angulo) * radio
    const sy = cy + Math.sin(angulo) * radio
    const d = Math.hypot(x - sx, y - sy)
    const punto = limitar((radio * 0.13 - d) / 1.2, 0, 1)
    if (punto > 0) {
      // El de arriba en naranja: el guino al logo, y rompe la simetria.
      resultado = i === 0 ? NARANJA : AZUL
      alfa = Math.max(alfa, punto)
    }
  }

  return { color: resultado, alfa }
}

// --- Generacion --------------------------------------------------------------

fs.mkdirSync(DESTINO, { recursive: true })

const escribir = (nombre, buffer) => {
  fs.writeFileSync(path.join(DESTINO, nombre), buffer)
  console.log(`  ${nombre.padEnd(26)} ${(buffer.length / 1024).toFixed(1)} KB`)
}

console.log('\nGenerando recursos de marca...\n')

// Icono de la aplicacion: anillo sobre fondo transparente.
// A 512 porque es el minimo que pide electron-builder para generar el .icns de
// macOS; el .ico de Windows se hace aparte a 256, que es su tamano maximo util.
const icono = (lado) =>
  crearPng(lado, lado, (x, y) => {
    const { color, alfa } = dibujarAnillo(AZUL, x, y, lado / 2, lado / 2, lado * 0.36)
    return { r: color.r, g: color.g, b: color.b, a: Math.round(alfa * 255) }
  })

escribir('icon.png', icono(512))
escribir('icon.ico', crearIco(icono(256), 256))

/** Panel lateral del instalador. El anillo se sale por abajo a proposito. */
const panel = (ancho, alto) =>
  crearBmp(ancho, alto, (x, y) => {
    const base = fondo(x, y, ancho, alto)
    const { color, alfa } = dibujarAnillo(AZUL, x, y, ancho * 0.5, alto * 0.34, ancho * 0.3)
    return mezclar(base, color, alfa)
  })

escribir('installerSidebar.bmp', panel(164, 314))
escribir('uninstallerSidebar.bmp', panel(164, 314))

// Cabecera de las paginas interiores: anillo pequeno a la derecha.
escribir(
  'installerHeader.bmp',
  crearBmp(150, 57, (x, y) => {
    const base = fondo(x, y, 150, 57)
    const { color, alfa } = dibujarAnillo(AZUL, x, y, 122, 28, 18)
    return mezclar(base, color, alfa)
  })
)

// Fondo del DMG de macOS, con la flecha implicita: icono a la izquierda,
// carpeta Aplicaciones a la derecha.
escribir(
  'dmg-background.png',
  crearPng(540, 380, (x, y) => {
    const base = fondo(x, y, 540, 380)
    const { color, alfa } = dibujarAnillo(AZUL, x, y, 270, 96, 54)
    const c = mezclar(base, color, alfa)
    return { r: c.r, g: c.g, b: c.b, a: 255 }
  })
)

console.log('\nListo. Estos ficheros los consume electron-builder.\n')
