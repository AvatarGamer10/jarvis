import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
  type Variants
} from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * The app's motion vocabulary.
 *
 * Everything that moves in Vilo moves in one of the ways defined here, and
 * they all say the same thing: matter arrives from below, slightly out of
 * focus, and settles. Nothing slides in from the side, nothing bounces, and
 * nothing spins unless it is genuinely waiting on something.
 *
 * These are our own components, but the ideas behind several of them —
 * per-word blur reveals, rotating text, in-view content — are the ones React
 * Bits demonstrates. The implementations here are written against Vilo's own
 * tokens and are deliberately much quieter than the originals.
 *
 * Every component honours prefers-reduced-motion by rendering the finished
 * state with no animation at all.
 */

/** The house curve. Fast out of the gate, long tail — it reads as weight. */
export const EASE = [0.16, 1, 0.3, 1] as const

export const SPRING: Transition = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 }

// -------------------------------------------------------------------------
// Reveal — the default entrance
// -------------------------------------------------------------------------

interface RevealProps {
  children: ReactNode
  /** Seconds before it starts. */
  delay?: number
  /** How far it travels, in pixels. Negative comes down from above. */
  distance?: number
  /** Blur it starts at. Zero for anything containing a live canvas. */
  blur?: number
  duration?: number
  className?: string
  style?: React.CSSProperties
  as?: 'div' | 'section' | 'header' | 'footer' | 'li' | 'article'
}

export function Reveal({
  children,
  delay = 0,
  distance = 10,
  blur = 6,
  duration = 0.62,
  className,
  style,
  as = 'div'
}: RevealProps): JSX.Element {
  const still = useReducedMotion()
  const Tag = motion[as]

  if (still) {
    return (
      <Tag className={className} style={style}>
        {children}
      </Tag>
    )
  }

  return (
    <Tag
      className={className}
      style={style}
      initial={{ opacity: 0, y: distance, filter: `blur(${blur}px)` }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration, ease: EASE, delay }}
    >
      {children}
    </Tag>
  )
}

// -------------------------------------------------------------------------
// Stagger — a list whose items arrive one after another
// -------------------------------------------------------------------------

const STAGGER_PARENT: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } }
}

const STAGGER_CHILD: Variants = {
  hidden: { opacity: 0, y: 9, filter: 'blur(5px)' },
  shown: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: EASE }
  }
}

export function Stagger({
  children,
  className,
  style,
  gap
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  gap?: number
}): JSX.Element {
  const still = useReducedMotion()
  if (still) {
    return (
      <div className={className} style={{ gap, ...style }}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      style={{ gap, ...style }}
      variants={STAGGER_PARENT}
      initial="hidden"
      animate="shown"
    >
      {children}
    </motion.div>
  )
}

/** One row of a {@link Stagger}. Anything else in there just appears. */
export function StaggerItem({
  children,
  className,
  style
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}): JSX.Element {
  const still = useReducedMotion()
  if (still) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }
  return (
    <motion.div className={className} style={style} variants={STAGGER_CHILD}>
      {children}
    </motion.div>
  )
}

// -------------------------------------------------------------------------
// BlurIn — prose that resolves word by word
// -------------------------------------------------------------------------

interface BlurInProps {
  text: string
  /** Seconds between words. */
  stagger?: number
  delay?: number
  className?: string
  as?: 'p' | 'h1' | 'h2' | 'span'
}

/**
 * A paragraph that comes into focus a word at a time.
 *
 * Kept to whole words on purpose: per-letter looks impressive for three
 * seconds and then makes every sentence in the app feel like a title
 * sequence.
 */
export function BlurIn({
  text,
  stagger = 0.028,
  delay = 0,
  className,
  as = 'p'
}: BlurInProps): JSX.Element {
  const still = useReducedMotion()
  const Tag = motion[as]
  const words = useMemo(() => text.split(' '), [text])

  if (still) {
    const Plain = as
    return <Plain className={className}>{text}</Plain>
  }

  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          aria-hidden="true"
          style={{ display: 'inline-block', whiteSpace: 'pre', willChange: 'filter, opacity' }}
          initial={{ opacity: 0, y: 6, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.55, ease: EASE, delay: delay + index * stagger }}
        >
          {word}
          {index < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </Tag>
  )
}

// -------------------------------------------------------------------------
// TextSwap — one line that becomes another
// -------------------------------------------------------------------------

interface TextSwapProps {
  phrases: readonly string[]
  /** Milliseconds each phrase is held. */
  interval?: number
  className?: string
  /** Pause on the first phrase before the rotation begins. */
  lead?: number
}

/**
 * The greeting.
 *
 * The whole line does not cross-fade — each letter leaves on its own, from
 * the centre outwards, dissolving upward into blur while the next line
 * condenses out of blur underneath it. The two overlap by design: for about a
 * fifth of a second the old sentence is still legible through the new one,
 * which is what makes it read as one thought turning into another rather than
 * as two slides.
 */
export function TextSwap({
  phrases,
  interval = 4200,
  className,
  lead = 1600
}: TextSwapProps): JSX.Element {
  const [index, setIndex] = useState(0)
  const still = useReducedMotion()

  useEffect(() => {
    if (still || phrases.length < 2) return
    let timer = 0

    const advance = (): void => {
      setIndex((current) => (current + 1) % phrases.length)
      timer = window.setTimeout(advance, interval)
    }

    timer = window.setTimeout(advance, interval + lead)
    return () => window.clearTimeout(timer)
  }, [phrases, interval, lead, still])

  const phrase = phrases[index]

  if (still) return <span className={className}>{phrase}</span>

  const letters = Array.from(phrase)
  const centre = (letters.length - 1) / 2

  return (
    <span className={`text-swap ${className ?? ''}`.trim()}>
      {/* Screen readers get the sentence once, not letter by letter. */}
      <span className="sr-only">{phrase}</span>

      {/*
       * `sync`, not `wait`. The overlap is the effect: for a fifth of a second
       * the old sentence is still faintly legible through the new one, which
       * is what makes it read as one thought turning into another instead of
       * as two slides. Both lines occupy the same grid cell, so nothing has to
       * be taken out of flow and no layout animation is involved — a layout
       * animation on text scales the glyphs, and it looks awful.
       */}
      <AnimatePresence mode="sync" initial={false}>
        <motion.span key={index} className="text-swap-line" aria-hidden="true">
          {letters.map((letter, position) => {
            // Distance from the middle of the line, normalised. Letters at
            // the ends move last on the way in and first on the way out.
            const reach = Math.abs(position - centre) / Math.max(centre, 1)
            return (
              <motion.span
                key={position}
                className="text-swap-letter"
                initial={{ opacity: 0, y: 16, filter: 'blur(12px)', scale: 0.94 }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
                exit={{ opacity: 0, y: -14, filter: 'blur(12px)', scale: 1.05 }}
                transition={{
                  duration: 0.62,
                  ease: EASE,
                  delay: reach * 0.16
                }}
              >
                {letter === ' ' ? ' ' : letter}
              </motion.span>
            )
          })}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

// -------------------------------------------------------------------------
// Specular — pointer-tracked light
// -------------------------------------------------------------------------

/**
 * Follows the pointer across an element and publishes where it is as two CSS
 * variables, `--px` and `--py`, in percentages.
 *
 * The stylesheet does the rest: buttons put a soft highlight there, cards put
 * a wider one. Doing it in CSS rather than in React means the highlight moves
 * on the compositor and costs nothing to render, and it means an element only
 * has to opt in by taking the class.
 *
 * Attach the returned ref to any element with `.specular` on it.
 */
export function useSpecular<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0

    const move = (event: PointerEvent): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const box = node.getBoundingClientRect()
        node.style.setProperty('--px', `${((event.clientX - box.left) / box.width) * 100}%`)
        node.style.setProperty('--py', `${((event.clientY - box.top) / box.height) * 100}%`)
      })
    }

    const leave = (): void => {
      node.style.removeProperty('--px')
      node.style.removeProperty('--py')
    }

    node.addEventListener('pointermove', move)
    node.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(frame)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerleave', leave)
    }
  }, [])

  return ref
}

/**
 * Turns on pointer tracking for every `.specular` element under the document,
 * present and future, with one listener.
 *
 * The hook above is fine for a handful of elements, but buttons appear and
 * disappear constantly, and giving each one its own ref and its own two
 * listeners is a lot of bookkeeping for a highlight. This does it once, at the
 * document, and costs a single rAF per pointer move.
 */
export function startSpecularTracking(): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  let frame = 0
  let last: HTMLElement | null = null

  const move = (event: PointerEvent): void => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const target =
        (event.target as HTMLElement | null)?.closest<HTMLElement>('.btn, .specular') ?? null

      if (last && last !== target) {
        last.style.removeProperty('--px')
        last.style.removeProperty('--py')
      }
      last = target

      if (!target) return
      const box = target.getBoundingClientRect()
      target.style.setProperty('--px', `${((event.clientX - box.left) / box.width) * 100}%`)
      target.style.setProperty('--py', `${((event.clientY - box.top) / box.height) * 100}%`)
    })
  }

  document.addEventListener('pointermove', move, { passive: true })
  return () => {
    cancelAnimationFrame(frame)
    document.removeEventListener('pointermove', move)
  }
}

// -------------------------------------------------------------------------
// Swap — height-aware container for content that changes
// -------------------------------------------------------------------------

/**
 * Cross-fades between two pieces of content and animates its own height
 * between them, so nothing below it jumps.
 *
 * This is what the setup steps and the settings panels use. The jump is the
 * whole reason it exists: swapping a tall panel for a short one moves every
 * control underneath, and people click the wrong thing.
 */
export function Swap({
  children,
  swapKey,
  className
}: {
  children: ReactNode
  swapKey: string | number
  className?: string
}): JSX.Element {
  const still = useReducedMotion()
  const [height, setHeight] = useState<number | 'auto'>('auto')
  const inner = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = inner.current
    if (!node) return
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight))
    observer.observe(node)
    setHeight(node.offsetHeight)
    return () => observer.disconnect()
  }, [swapKey])

  if (still) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      style={{ overflow: 'hidden' }}
      animate={{ height }}
      transition={{ duration: 0.42, ease: EASE }}
    >
      <div ref={inner}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={swapKey}
            initial={{ opacity: 0, y: 8, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6, filter: 'blur(5px)' }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
