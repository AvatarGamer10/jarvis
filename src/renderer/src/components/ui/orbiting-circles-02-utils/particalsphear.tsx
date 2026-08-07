import { useEffect, useRef } from 'react'

/**
 * Esfera de particulas que gira.
 *
 * OJO: este fichero no venia con el componente que se pego, solo la linea que
 * lo importa. Esta escrito aqui desde cero, asi que si aparece el original,
 * esto es lo que hay que sustituir.
 *
 * Va en canvas y no en SVG ni en DOM porque son cerca de mil puntos
 * repintandose sesenta veces por segundo: con un nodo por punto, el navegador
 * se pasaria el rato recalculando estilos.
 *
 * El color sale de las variables de la app, asi que si cambia la paleta, la
 * esfera cambia con ella.
 */

/** Puntos de la esfera. Por encima de ~1200 se ve igual y cuesta el doble. */
const PUNTOS = 900

/** Vuelta completa, en milisegundos. */
const VUELTA_MS = 26_000

/** Inclinacion del eje, para que no gire como una peonza vista de canto. */
const INCLINACION = 0.36

/** Cuanto se encoge un punto que esta al fondo respecto a uno de delante. */
const PROFUNDIDAD = 0.55

interface Punto {
  x: number
  y: number
  z: number
}

/**
 * Reparto en espiral de Fibonacci: los puntos quedan repartidos de verdad por
 * la superficie. Con angulos al azar se apelotonan en los polos, que es
 * exactamente donde se nota.
 */
function repartirEsfera(total: number): Punto[] {
  const dorado = Math.PI * (3 - Math.sqrt(5))

  return Array.from({ length: total }, (_, i) => {
    const y = 1 - (i / (total - 1)) * 2
    const radio = Math.sqrt(Math.max(0, 1 - y * y))
    const angulo = i * dorado
    return { x: Math.cos(angulo) * radio, y, z: Math.sin(angulo) * radio }
  })
}

/** "#c9c9c9" a [201, 201, 201]. Devuelve un gris medio si no se entiende. */
function aRgb(color: string): [number, number, number] {
  const limpio = color.trim().replace('#', '')
  if (limpio.length === 6) {
    const n = Number.parseInt(limpio, 16)
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  return [201, 201, 201]
}

export default function ParticleSphereAnimation(): JSX.Element {
  const lienzo = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = lienzo.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const puntos = repartirEsfera(PUNTOS)
    const raiz = getComputedStyle(document.documentElement)
    const [r, g, b] = aRgb(raiz.getPropertyValue('--signal') || '#c9c9c9')
    const [rc, gc, bc] = aRgb(raiz.getPropertyValue('--signal-bright') || '#ffffff')

    // Quien pide menos movimiento se lleva la esfera quieta, no una pantalla en
    // blanco: la forma sigue contando lo mismo sin girar.
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let ancho = 0
    let alto = 0
    /** Ultimo angulo pintado, para poder repintar sin esperar al siguiente
        fotograma. */
    let giro = 0

    const pintar = (): void => {
      if (ancho === 0 || alto === 0) return
      ctx.clearRect(0, 0, ancho, alto)

      const cx = ancho / 2
      const cy = alto / 2
      const radio = Math.min(ancho, alto) / 2

      const sen = Math.sin(giro)
      const cos = Math.cos(giro)
      const senI = Math.sin(INCLINACION)
      const cosI = Math.cos(INCLINACION)

      for (const p of puntos) {
        // Giro sobre el eje vertical y despues inclinacion sobre el horizontal.
        const x1 = p.x * cos - p.z * sen
        const z1 = p.x * sen + p.z * cos
        const y2 = p.y * cosI - z1 * senI
        const z2 = p.y * senI + z1 * cosI

        // z2 va de -1 (fondo) a 1 (frente).
        const frente = (z2 + 1) / 2
        const tam = radio * 0.0075 * (PROFUNDIDAD + (1 - PROFUNDIDAD) * frente)
        const alfa = 0.12 + frente * 0.62

        // Los de delante tiran a blanco; los del fondo se quedan en gris.
        const mezcla = frente * frente
        const cr = Math.round(r + (rc - r) * mezcla)
        const cg = Math.round(g + (gc - g) * mezcla)
        const cb = Math.round(b + (bc - b) * mezcla)

        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alfa.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(cx + x1 * radio * 0.92, cy - y2 * radio * 0.92, tam, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    /**
     * Ajusta el lienzo a su tamano real y repinta.
     *
     * El repintado no es opcional: cambiar `canvas.width` borra el contenido.
     * Sin esto la esfera desaparece en cada cambio de tamano hasta el siguiente
     * fotograma, y si el navegador tiene la animacion parada —pestana de fondo,
     * ventana oculta— no vuelve nunca.
     */
    const medir = (): void => {
      const escala = window.devicePixelRatio || 1
      const caja = canvas.getBoundingClientRect()
      ancho = caja.width
      alto = caja.height
      canvas.width = Math.round(ancho * escala)
      canvas.height = Math.round(alto * escala)
      // El contexto se reescala en vez de dibujar en pixeles fisicos: asi el
      // resto del codigo trabaja en unidades CSS y no se difumina en pantallas
      // de alta densidad.
      ctx.setTransform(escala, 0, 0, escala, 0, 0)
      pintar()
    }

    medir()

    let fotograma = 0
    if (!quieto) {
      const inicio = performance.now()
      const paso = (ahora: number): void => {
        giro = ((ahora - inicio) / VUELTA_MS) * Math.PI * 2
        pintar()
        fotograma = requestAnimationFrame(paso)
      }
      fotograma = requestAnimationFrame(paso)
    }

    // El contenedor es responsive (w-75 en movil, w-145 en escritorio), asi que
    // sin esto la esfera se estiraria al cambiar de tamano la ventana.
    const observador = new ResizeObserver(medir)
    observador.observe(canvas)

    return () => {
      cancelAnimationFrame(fotograma)
      observador.disconnect()
    }
  }, [])

  return <canvas ref={lienzo} className="w-full h-full" aria-hidden="true" />
}
