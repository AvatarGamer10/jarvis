import { useEffect, useRef, useState } from 'react'

/**
 * Text that arrives one word at a time, each one rising into focus.
 *
 * Every word mounts with a blur that resolves as it lifts, so a sentence
 * assembles itself the way it is being said instead of appearing as a block
 * that was already finished. The blur is the part that matters: without it
 * this is just a slide, and it reads as decoration rather than as speech.
 *
 * When the speech synthesiser reports word boundaries, `spokenChars` follows
 * the voice exactly and the text is genuinely in time with it. When it does
 * not — and plenty of platforms never fire those events — the fallback pace
 * takes over and nobody can tell the difference.
 */

interface Props {
  text: string
  /**
   * Characters of `text` spoken so far. Leave undefined to reveal on a timer.
   */
  spokenChars?: number
  /** Milliseconds per word when running on the timer. */
  pace?: number
  /** Reveal everything at once. For text that is being read, not spoken. */
  instant?: boolean
  className?: string
}

/**
 * Split into words with their trailing whitespace attached.
 *
 * Keeping the space glued to the word it follows means the layout never
 * reflows as words appear — a separate space node would collapse and every
 * line would shuffle sideways on each reveal.
 */
function tokenise(text: string): { word: string; at: number }[] {
  const tokens: { word: string; at: number }[] = []
  const pattern = /\S+\s*/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ word: match[0], at: match.index })
  }
  return tokens
}

/** Minimum gap between two words appearing, however far behind we are. */
const MIN_GAP = 26

export default function StreamingText({
  text,
  spokenChars,
  pace = 150,
  instant = false,
  className
}: Props): JSX.Element {
  const [tokens, setTokens] = useState(() => tokenise(text))
  const [visible, setVisible] = useState(() => (instant ? tokens.length : 0))

  const spokenRef = useRef(spokenChars)
  const startedAt = useRef(performance.now())

  useEffect(() => {
    spokenRef.current = spokenChars
  }, [spokenChars])

  // New text starts over. Without this, a shorter second answer would inherit
  // the first one's reveal count and appear complete on arrival.
  useEffect(() => {
    const next = tokenise(text)
    setTokens(next)
    setVisible(instant ? next.length : 0)
    startedAt.current = performance.now()
  }, [text, instant])

  useEffect(() => {
    if (instant || tokens.length === 0) return

    let frame = 0
    let lastReveal = 0

    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)

      setVisible((current) => {
        if (current >= tokens.length) return current

        // Where the voice has actually got to, or where the clock says we
        // should be if nothing is speaking.
        const spoken = spokenRef.current
        const target =
          spoken === undefined
            ? Math.floor((now - startedAt.current) / pace) + 1
            : tokens.filter((token) => token.at <= spoken).length

        if (current >= target) return current
        // One word per tick, and never faster than the eye can follow. Being
        // behind is fine; catching up in a single flash is not.
        if (now - lastReveal < MIN_GAP) return current

        lastReveal = now
        return current + 1
      })
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [tokens, pace, instant])

  return (
    <p className={className}>
      {tokens.slice(0, visible).map((token, index) => (
        <span className="word" key={index}>
          {token.word}
        </span>
      ))}
    </p>
  )
}
