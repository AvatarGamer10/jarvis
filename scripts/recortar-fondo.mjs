/**
 * Quita el fondo uniforme de una imagen PNG.
 *
 * Rellena desde los bordes hacia dentro mientras los pixeles se parezcan al
 * color de las esquinas, y se detiene en cuanto encuentra algo distinto. Eso
 * respeta el interior del dibujo: las zonas oscuras que estan *dentro* de una
 * figura no se tocan, porque el relleno nunca llega hasta ellas.
 *
 * La transparencia no es binaria. Dentro de la zona rellenada, el alfa crece
 * segun lo lejos que quede el pixel del color de fondo, para que los halos y
 * degradados se desvanezcan en vez de cortarse con un borde dentado.
 *
 *   node scripts/recortar-fondo.mjs src/renderer/public/logo.png
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// --- PNG ---------------------------------------------------------------------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function trozo(tipo, datos) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([len, cuerpo, crc])
}

const CANALES = { 0: 1, 2: 3, 4: 2, 6: 4 }

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Descodifica a RGBA de 8 bits. */
function decodificar(buffer) {
  let i = 8
  let cab = null
  const idat = []

  while (i < buffer.length) {
    const len = buffer.readUInt32BE(i)
    const tipo = buffer.toString('ascii', i + 4, i + 8)
    const datos = buffer.subarray(i + 8, i + 8 + len)
    if (tipo === 'IHDR') {
      cab = {
        ancho: datos.readUInt32BE(0),
        alto: datos.readUInt32BE(4),
        bits: datos[8],
        tipoColor: datos[9],
        entrelazado: datos[12]
      }
    } else if (tipo === 'IDAT') idat.push(datos)
    else if (tipo === 'IEND') break
    i += 12 + len
  }

  if (!cab) throw new Error('PNG sin IHDR')
  if (cab.bits !== 8 || cab.entrelazado !== 0) {
    throw new Error('solo se admiten PNG de 8 bits sin entrelazar')
  }

  const canales = CANALES[cab.tipoColor]
  if (!canales) throw new Error(`tipo de color ${cab.tipoColor} no admitido`)

  const anchoFila = cab.ancho * canales
  const crudo = zlib.inflateSync(Buffer.concat(idat))
  const plano = Buffer.alloc(cab.alto * anchoFila)

  let o = 0
  for (let y = 0; y < cab.alto; y++) {
    const filtro = crudo[o++]
    const fila = y * anchoFila
    const arriba = fila - anchoFila
    for (let x = 0; x < anchoFila; x++) {
      const v = crudo[o++]
      const a = x >= canales ? plano[fila + x - canales] : 0
      const b = y > 0 ? plano[arriba + x] : 0
      const c = y > 0 && x >= canales ? plano[arriba + x - canales] : 0
      let r
      switch (filtro) {
        case 0: r = v; break
        case 1: r = v + a; break
        case 2: r = v + b; break
        case 3: r = v + ((a + b) >> 1); break
        case 4: r = v + paeth(a, b, c); break
        default: throw new Error(`filtro ${filtro} desconocido`)
      }
      plano[fila + x] = r & 0xff
    }
  }

  // Se normaliza todo a RGBA para no arrastrar casos por el resto del script.
  const rgba = Buffer.alloc(cab.ancho * cab.alto * 4)
  for (let p = 0; p < cab.ancho * cab.alto; p++) {
    const s = p * canales
    const d = p * 4
    if (canales >= 3) {
      rgba[d] = plano[s]
      rgba[d + 1] = plano[s + 1]
      rgba[d + 2] = plano[s + 2]
      rgba[d + 3] = canales === 4 ? plano[s + 3] : 255
    } else {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = plano[s]
      rgba[d + 3] = canales === 2 ? plano[s + 1] : 255
    }
  }

  return { ancho: cab.ancho, alto: cab.alto, rgba }
}

function codificar(ancho, alto, rgba) {
  const crudo = Buffer.alloc(alto * (ancho * 4 + 1))
  let i = 0
  for (let y = 0; y < alto; y++) {
    crudo[i++] = 0
    rgba.copy(crudo, i, y * ancho * 4, (y + 1) * ancho * 4)
    i += ancho * 4
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ])
}

// --- Recorte -----------------------------------------------------------------

/** Distancia entre dos colores, 0 = identicos. */
const distancia = (rgba, p, r, g, b) =>
  Math.abs(rgba[p] - r) + Math.abs(rgba[p + 1] - g) + Math.abs(rgba[p + 2] - b)

/**
 * Por debajo de ESTE parecido el pixel se considera fondo puro y desaparece
 * del todo. Entre este valor y el de corte, se desvanece progresivamente.
 */
const UMBRAL_FONDO = 24
const UMBRAL_CORTE = 90

function recortar(imagen) {
  const { ancho, alto, rgba } = imagen

  // Color de referencia: la mediana de las cuatro esquinas, para que un pixel
  // suelto raro en una esquina no desvie el calculo.
  const esquinas = [
    0,
    (ancho - 1) * 4,
    (alto - 1) * ancho * 4,
    ((alto - 1) * ancho + ancho - 1) * 4
  ]
  const canal = (i) => {
    const v = esquinas.map((p) => rgba[p + i]).sort((a, b) => a - b)
    return Math.round((v[1] + v[2]) / 2)
  }
  const [fr, fg, fb] = [canal(0), canal(1), canal(2)]

  // Relleno por difusion desde el borde. Se usa una pila propia en vez de
  // recursion: con imagenes grandes, la recursion desborda la pila.
  const visitado = new Uint8Array(ancho * alto)
  const pila = []

  for (let x = 0; x < ancho; x++) {
    pila.push(x, (alto - 1) * ancho + x)
  }
  for (let y = 0; y < alto; y++) {
    pila.push(y * ancho, y * ancho + ancho - 1)
  }

  let quitados = 0

  while (pila.length > 0) {
    const idx = pila.pop()
    if (visitado[idx]) continue

    const p = idx * 4
    const d = distancia(rgba, p, fr, fg, fb)
    if (d > UMBRAL_CORTE) continue

    visitado[idx] = 1

    // Alfa proporcional: lo identico al fondo se va del todo, y lo que se
    // aleja va apareciendo. Asi los halos se desvanecen sin escalones.
    const alfa =
      d <= UMBRAL_FONDO
        ? 0
        : Math.round(((d - UMBRAL_FONDO) / (UMBRAL_CORTE - UMBRAL_FONDO)) * 255)

    if (alfa < rgba[p + 3]) {
      rgba[p + 3] = alfa
      if (alfa === 0) quitados++
    }

    const x = idx % ancho
    const y = (idx / ancho) | 0
    if (x > 0) pila.push(idx - 1)
    if (x < ancho - 1) pila.push(idx + 1)
    if (y > 0) pila.push(idx - ancho)
    if (y < alto - 1) pila.push(idx + ancho)
  }

  return { fondo: [fr, fg, fb], quitados, total: ancho * alto }
}

// --- Main --------------------------------------------------------------------

const objetivo = process.argv[2]
if (!objetivo) {
  console.error('Uso: node scripts/recortar-fondo.mjs <ruta-al-png>')
  process.exit(1)
}

const ruta = path.resolve(objetivo)
if (!fs.existsSync(ruta)) {
  console.error(`No existe: ${ruta}`)
  process.exit(1)
}

const imagen = decodificar(fs.readFileSync(ruta))
const { fondo, quitados, total } = recortar(imagen)

// Copia de seguridad antes de sobrescribir: si el recorte no convence, se
// recupera el original sin tener que volver a exportarlo.
//
// Va a una carpeta aparte y no junto al fichero: todo lo que hay en
// src/renderer/public se copia dentro de la app al empaquetar, y el original
// acabaria distribuido a todo el mundo como peso muerto.
const carpetaCopias = path.resolve(process.cwd(), '.copias')
fs.mkdirSync(carpetaCopias, { recursive: true })
const copia = path.join(carpetaCopias, path.basename(ruta).replace(/\.png$/i, '.original.png'))
if (!fs.existsSync(copia)) fs.copyFileSync(ruta, copia)

fs.writeFileSync(ruta, codificar(imagen.ancho, imagen.alto, imagen.rgba))

const porcentaje = ((quitados / total) * 100).toFixed(1)
console.log(`\nColor de fondo detectado: rgb(${fondo.join(', ')})`)
console.log(`Pixeles eliminados: ${porcentaje}% de la imagen`)
console.log(`Original guardado en: ${path.basename(copia)}\n`)
