/**
 * Generates the installer artwork and the app icon.
 *
 * Drawn in code rather than checked in as binary files: the same reasoning as
 * the tray icon and the sounds. The practical advantage is that changing the
 * brand colour means touching one constant and running this again, without
 * opening an image editor.
 *
 * PNG and BMP are written by hand because they are simple formats: a BMP is a
 * header plus raw pixels, and a PNG is a header plus those same pixels run
 * through zlib, which Node already ships.
 *
 *   node scripts/generar-recursos.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = path.join(ROOT, 'build')

// --- The palette, the same one the interface uses ----------------------------
//
// Vilo has no colour: one grey ramp, with white reserved for what matters.
// These are the same values as tokens.css.

const DARK_BACKGROUND = { r: 0x0d, g: 0x0d, b: 0x10 }
const LIGHT_BACKGROUND = { r: 0x26, g: 0x26, b: 0x2c }
const INK = { r: 0xf2, g: 0xf2, b: 0xf5 }

const mix = (a, b, t) => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t)
})

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// --- PNG ---------------------------------------------------------------------

/** The CRC32 table, which is what validates each chunk of a PNG. */
const CRC_TABLE = (() => {
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
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(kind, data) {
  const longitud = Buffer.alloc(4)
  longitud.writeUInt32BE(data.length)
  const cuerpo = Buffer.concat([Buffer.from(kind, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([longitud, cuerpo, crc])
}

/** `paint(x, y)` returns {r, g, b, a}, with a from 0 to 255. */
function makePng(width, height, paint) {
  // Every row is prefixed with a filter byte; 0 means "no filter".
  const crudo = Buffer.alloc(height * (width * 4 + 1))
  let i = 0
  for (let y = 0; y < height; y++) {
    crudo[i++] = 0
    for (let x = 0; x < width; x++) {
      const { r, g, b, a } = paint(x, y)
      crudo[i++] = r
      crudo[i++] = g
      crudo[i++] = b
      crudo[i++] = a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bits per channel
  ihdr[9] = 6 // color RGBA
  ihdr[10] = 0 // compresion
  ihdr[11] = 0 // filtrado
  ihdr[12] = 0 // no interlacing

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// --- BMP ---------------------------------------------------------------------

/**
 * A 24-bit BMP. NSIS accepts no PNG for the sidebar or the header, and does
 * not understand transparency there either, so these images are opaque.
 */
function makeBmp(width, height, paint) {
  // Cada fila se rellena hasta un multiplo de 4 bytes.
  const relleno = (4 - ((width * 3) % 4)) % 4
  const tamanoFila = width * 3 + relleno
  const tamanoDatos = tamanoFila * height
  const header = Buffer.alloc(54)

  header.write('BM', 0, 'ascii')
  header.writeUInt32LE(54 + tamanoDatos, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(tamanoDatos, 34)
  header.writeInt32LE(2835, 38)
  header.writeInt32LE(2835, 42)

  const data = Buffer.alloc(tamanoDatos)
  for (let y = 0; y < height; y++) {
    // A BMP stores its rows bottom to top.
    const destino = (height - 1 - y) * tamanoFila
    for (let x = 0; x < width; x++) {
      const { r, g, b } = paint(x, y)
      const i = destino + x * 3
      data[i] = b
      data[i + 1] = g
      data[i + 2] = r
    }
  }

  return Buffer.concat([header, data])
}

// --- ICO ---------------------------------------------------------------------

/** An ICO with a PNG inside, which is what Windows has taken since Vista. */
function makeIco(png, side) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // kind icon
  header.writeUInt16LE(1, 4) // a single image

  const entry = Buffer.alloc(16)
  entry[0] = side >= 256 ? 0 : side // 0 significa 256
  entry[1] = side >= 256 ? 0 : side
  entry[2] = 0 // colores de palette
  entry[3] = 0
  entry.writeUInt16LE(1, 4) // planos
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12) // offset to the data

  return Buffer.concat([header, entry, png])
}

// --- Motivos -----------------------------------------------------------------

/**
 * Cobertura suavizada de un ring. Devuelve 1 dentro, 0 fuera y valores
 * intermediate values at the edge, which is what avoids the jagged steps.
 */
function ring(distance, outer, inner, feather = 1.2) {
  const fuera = clamp((outer - distance) / feather, 0, 1)
  const dentro = clamp((distance - inner) / feather, 0, 1)
  return Math.min(fuera, dentro)
}

/** The app background: a graphite gradient, with nothing else on top. */
function background(x, y, width, height) {
  return mix(LIGHT_BACKGROUND, DARK_BACKGROUND, clamp((x / width) * 0.5 + (y / height) * 0.8, 0, 1))
}

/**
 * The orb: a ring with a bright core.
 *
 * The same shape as the voice screen and the tray icon, so the installer and
 * the DMG show what the user is about to see when the app opens, rather than a
 * different drawing that appears once and never again.
 */
function drawOrb(x, y, cx, cy, radius) {
  const distance = Math.hypot(x - cx, y - cy)

  // Anillo.
  let alfa = ring(distance, radius, radius - Math.max(2, radius * 0.06))
  // Nucleo.
  alfa = Math.max(alfa, clamp((radius * 0.16 - distance) / 1.2, 0, 1))
  // A halo just outside it, which is what gives it the glow.
  alfa = Math.max(alfa, Math.exp(-Math.abs(distance - radius) / (radius * 0.09)) * 0.22)

  return { color: INK, alfa: clamp(alfa, 0, 1) }
}

// --- Generacion --------------------------------------------------------------

fs.mkdirSync(OUTPUT, { recursive: true })

const write = (name, buffer) => {
  fs.writeFileSync(path.join(OUTPUT, name), buffer)
  console.log(`  ${name.padEnd(26)} ${(buffer.length / 1024).toFixed(1)} KB`)
}

console.log('\nGenerating brand assets…\n')

/**
 * Icono de la aplicacion.
 *
 * `build/icon.png` is NOT generated here: it is the real Vilo mark, traced by
 * hand, and no code drawing is going to match it. It lives in the repository y
 * este script no lo toca.
 *
 * The Windows .ico is drawn, with the orb, because converting the PNG
 * would need a whole decoder for a format only required when packaging for
 * Windows. It waits until that build is due.
 */
const icon = (side) =>
  makePng(side, side, (x, y) => {
    const { color, alfa } = drawOrb(x, y, side / 2, side / 2, side * 0.34)
    return { r: color.r, g: color.g, b: color.b, a: Math.round(alfa * 255) }
  })

if (fs.existsSync(path.join(OUTPUT, 'icon.png'))) {
  console.log('  icon.png                   already exists; Vilo’s own mark is kept')
} else {
  write('icon.png', icon(512))
}
write('icon.ico', makeIco(icon(256), 256))

/** The installer sidebar. The ring runs off the bottom on purpose. */
const panel = (width, height) =>
  makeBmp(width, height, (x, y) => {
    const base = background(x, y, width, height)
    const { color, alfa } = drawOrb(x, y, width * 0.5, height * 0.34, width * 0.3)
    return mix(base, color, alfa)
  })

write('installerSidebar.bmp', panel(164, 314))
write('uninstallerSidebar.bmp', panel(164, 314))

// Header for the inner pages: a small ring on the right.
write(
  'installerHeader.bmp',
  makeBmp(150, 57, (x, y) => {
    const base = background(x, y, 150, 57)
    const { color, alfa } = drawOrb(x, y, 122, 28, 18)
    return mix(base, color, alfa)
  })
)

// The macOS DMG background, with the arrow implied: icon on the left,
// the Applications folder on the right.
write(
  'dmg-background.png',
  makePng(540, 380, (x, y) => {
    const base = background(x, y, 540, 380)
    const { color, alfa } = drawOrb(x, y, 270, 96, 54)
    const c = mix(base, color, alfa)
    return { r: c.r, g: c.g, b: c.b, a: 255 }
  })
)

console.log('\nDone. electron-builder consumes these files.\n')
