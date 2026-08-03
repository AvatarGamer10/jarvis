/**
 * Comprueba que las imagenes de marca estan bien puestas.
 *
 * El fallo tipico no es olvidarse del fichero, sino exportarlo con fondo
 * blanco: la interfaz es oscura y aparece un recuadro pegado. Eso no se
 * detecta mirando la cabecera del PNG, porque un PNG con canal alfa donde
 * todos los pixeles son opacos es tecnicamente valido. Hay que mirar los
 * pixeles de verdad, asi que aqui se descodifica el PNG a mano.
 *
 *   node scripts/verificar-imagenes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(RAIZ, 'src', 'renderer', 'public')

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m'
}

/**
 * Un unico logo para toda la app. Al no llevar texto sirve igual a 340 px en
 * la bienvenida que a 26 px en el boton de volver, asi que no hace falta una
 * version reducida aparte.
 */
const ESPERADAS = [
  {
    fichero: 'logo.png',
    donde: 'bienvenida, centro del anillo y boton de volver',
    // Se pide grande porque el navegador reduce bien pero amplia fatal.
    anchoMin: 512,
    cuadradaRecomendada: true,
    transparencia: true
  },
  {
    fichero: 'fondo.png',
    donde: 'fondo de la app',
    anchoMin: 1200,
    transparencia: false
  }
]

// --- Descodificador de PNG ---------------------------------------------------

const CANALES = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function leerPng(buffer) {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!firma.every((b, i) => buffer[i] === b)) throw new Error('no es un PNG')

  let i = 8
  let ihdr = null
  const idat = []

  while (i < buffer.length) {
    const longitud = buffer.readUInt32BE(i)
    const tipo = buffer.toString('ascii', i + 4, i + 8)
    const datos = buffer.subarray(i + 8, i + 8 + longitud)

    if (tipo === 'IHDR') {
      ihdr = {
        ancho: datos.readUInt32BE(0),
        alto: datos.readUInt32BE(4),
        bits: datos[8],
        tipoColor: datos[9],
        entrelazado: datos[12]
      }
    } else if (tipo === 'IDAT') {
      idat.push(datos)
    } else if (tipo === 'IEND') {
      break
    }

    i += 12 + longitud
  }

  if (!ihdr) throw new Error('PNG sin cabecera IHDR')
  return { ...ihdr, datos: Buffer.concat(idat) }
}

/** Predictor de Paeth, uno de los cinco filtros que define el formato. */
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Devuelve los pixeles sin filtrar, o null si el PNG usa algo que no cubrimos. */
function desfiltrar(png) {
  if (png.bits !== 8 || png.entrelazado !== 0) return null

  const canales = CANALES[png.tipoColor]
  if (!canales) return null

  const bpp = canales
  const anchoFila = png.ancho * bpp
  const crudo = zlib.inflateSync(png.datos)
  const salida = Buffer.alloc(png.alto * anchoFila)

  let origen = 0
  for (let y = 0; y < png.alto; y++) {
    const filtro = crudo[origen++]
    const fila = y * anchoFila
    const anterior = fila - anchoFila

    for (let x = 0; x < anchoFila; x++) {
      const valor = crudo[origen++]
      const a = x >= bpp ? salida[fila + x - bpp] : 0
      const b = y > 0 ? salida[anterior + x] : 0
      const cc = y > 0 && x >= bpp ? salida[anterior + x - bpp] : 0

      let recuperado
      switch (filtro) {
        case 0: recuperado = valor; break
        case 1: recuperado = valor + a; break
        case 2: recuperado = valor + b; break
        case 3: recuperado = valor + ((a + b) >> 1); break
        case 4: recuperado = valor + paeth(a, b, cc); break
        default: return null
      }
      salida[fila + x] = recuperado & 0xff
    }
  }

  return { pixeles: salida, canales }
}

/** Porcentaje de pixeles totalmente transparentes. */
function medirTransparencia(png) {
  if (png.tipoColor !== 6 && png.tipoColor !== 4) return 0

  const desfiltrado = desfiltrar(png)
  if (!desfiltrado) return null

  const { pixeles, canales } = desfiltrado
  let transparentes = 0
  const total = png.ancho * png.alto

  for (let p = 0; p < total; p++) {
    if (pixeles[p * canales + canales - 1] === 0) transparentes++
  }

  return (transparentes / total) * 100
}

// --- Comprobacion ------------------------------------------------------------

console.log(`\n${c.bold}Imagenes de marca${c.reset}  ${c.dim}${PUBLIC}${c.reset}\n`)

let fallos = 0
let avisos = 0

for (const esperada of ESPERADAS) {
  const ruta = path.join(PUBLIC, esperada.fichero)
  const etiqueta = esperada.fichero.padEnd(11)

  if (!fs.existsSync(ruta)) {
    console.log(`${c.yellow}  FALTA ${c.reset} ${etiqueta} ${c.dim}(${esperada.donde})${c.reset}`)
    avisos++
    continue
  }

  let png
  try {
    png = leerPng(fs.readFileSync(ruta))
  } catch (err) {
    console.log(`${c.red}  ERROR ${c.reset} ${etiqueta} ${err.message}`)
    console.log(`${c.dim}          Guardalo como PNG de verdad, no un JPG renombrado.${c.reset}`)
    fallos++
    continue
  }

  const problemas = []
  const notas = []

  if (png.ancho < esperada.anchoMin) {
    problemas.push(`se vera borroso: ${png.ancho} px de ancho, se recomiendan ${esperada.anchoMin}+`)
  }

  // Que no sea cuadrada no rompe nada, solo deja mas aire a los lados dentro
  // del anillo. Se avisa, pero no se da por malo.
  if (esperada.cuadradaRecomendada && png.ancho !== png.alto) {
    const desvio = Math.abs(png.ancho - png.alto) / Math.max(png.ancho, png.alto)
    if (desvio > 0.15) {
      notas.push(`no es cuadrada (${png.ancho}x${png.alto}); en el anillo quedara mas pequena`)
    }
  }

  if (esperada.transparencia) {
    const transparente = medirTransparencia(png)
    if (transparente === null) {
      problemas.push('no he podido leer sus pixeles, revisa la transparencia a ojo')
    } else if (transparente < 2) {
      problemas.push(
        `sin fondo transparente (${transparente.toFixed(1)}% de pixeles transparentes): ` +
          'se vera un recuadro sobre la interfaz oscura'
      )
    }
  }

  if (problemas.length === 0) {
    console.log(`${c.green}  OK    ${c.reset} ${etiqueta} ${png.ancho}x${png.alto} ${c.dim}(${esperada.donde})${c.reset}`)
  } else {
    console.log(`${c.red}  REVISA${c.reset} ${etiqueta} ${png.ancho}x${png.alto}`)
    for (const p of problemas) console.log(`${c.dim}          ${p}${c.reset}`)
    fallos++
  }

  for (const n of notas) console.log(`${c.dim}          nota: ${n}${c.reset}`)
}

console.log('')
if (fallos === 0 && avisos === 0) {
  console.log(`${c.green}${c.bold}Todo correcto.${c.reset}\n`)
} else if (fallos === 0) {
  console.log(`${c.yellow}Faltan ${avisos} imagen(es). La app funciona igual, con sustitutos.${c.reset}\n`)
} else {
  console.log(`${c.red}${c.bold}${fallos} imagen(es) con problemas.${c.reset}\n`)
}

process.exit(fallos > 0 ? 1 : 0)
