import { useEffect, useRef } from 'react'

export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking'

interface Props {
  size?: number
  className?: string
  state?: AssistantState
  /** Follow the pointer around the screen. Off for decorative copies. */
  interactive?: boolean
  /** 0–1 microphone level, sampled every frame while listening. */
  getActivity?: () => number
}

/**
 * Vilo, as a face.
 *
 * The artwork is the real logo — `public/vilo.svg`, authored as two groups so
 * the head and the eyes can be moved independently. Everything below is about
 * how it moves, and the movement is the whole character.
 *
 * Two things make the difference between this reading as alive and reading as
 * a logo with a script attached, and the first version of this file got both
 * of them wrong.
 *
 *   Amplitude.  The eyes travelled about four percent of the mark's width,
 *               which at the size it is drawn is a couple of pixels. It was
 *               moving the entire time and you had to be told to see it.
 *               Everything here is now two to three times further.
 *
 *   Dynamics.   The head chased its target by exponential decay — a constant
 *               fraction of the remaining distance every frame. That is the
 *               easiest smoothing to write and it is why it felt stiff: it
 *               starts at full speed, slows continuously, and never overshoots.
 *               Nothing with mass moves like that. It is a spring now, slightly
 *               under-damped, so it accelerates, overshoots a little, and
 *               settles back.
 *
 * The rest is how eyes actually behave:
 *
 *   Saccades.   Eyes do not glide. They sit still, then jump, then sit still
 *               again. The dwell between jumps is where the personality lives.
 *               The jumps here are deliberately three times slower than a real
 *               eye — at true speed, on a mark this size, they read as a
 *               twitch rather than as a movement you can follow.
 *
 *   Overshoot.  A real saccade lands slightly past its target and corrects.
 *
 *   Curves.     Every one of these runs through smootherstep, which has zero
 *               velocity and zero acceleration at both ends. A curve with a
 *               corner in its slope looks mechanical no matter how slow it is.
 *
 *   Head lag.   The head starts after the eyes have already arrived and is
 *               still settling when they have long since stopped.
 *
 *   Blinks.     Fast, uneven, occasionally doubled, and frequently attached to
 *               a large gaze shift — which is why blinking here is triggered by
 *               looking somewhere new, not only by a timer.
 *
 *   Tremor.     Continuous sub-pixel drift. Perfectly still eyes look dead even
 *               while everything around them moves.
 *
 * It glances at the pointer rather than locking onto it. Tracking exactly is
 * what makes an on-screen face feel like it is watching you instead of
 * noticing you.
 *
 * All of it is written to CSS custom properties on the root SVG and applied by
 * transforms in the stylesheet, so the whole thing is one rAF loop and no
 * React renders.
 */
export default function AssistantLogo({
  size = 220,
  className = '',
  state = 'idle',
  interactive = true,
  getActivity
}: Props): JSX.Element {
  const ref = useRef<SVGSVGElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.style.setProperty('--a-lid', '1')
      return
    }

    /*
     * Travel limits, in the SVG's own units — the viewBox is 1254 across, so
     * these are percentages of the mark at whatever size it is drawn.
     *
     * The ceilings come from the artwork. The eyes are two rounded bars at
     * x=480 and x=725, each 49 wide, so ±105 horizontally keeps both of them
     * comfortably inside the face; ±58 vertically does the same.
     */
    const EYE_REACH_X = 104
    const EYE_REACH_Y = 56
    const HEAD_REACH_X = 54
    const HEAD_REACH_Y = 32
    const HEAD_ROLL = 5

    /** Where the eyes are pointed, and the saccade currently in progress. */
    let gazeX = 0
    let gazeY = 0
    let fromX = 0
    let fromY = 0
    let toX = 0
    let toY = 0

    /** Head position and velocity — this is a spring, so it needs both. */
    let headX = 0
    let headY = 0
    let headVX = 0
    let headVY = 0

    /** Pointer, in the same -1..1 space, and when it last moved. */
    let pointerX = 0
    let pointerY = 0
    let pointerAt = -Infinity

    let saccadeStart = -Infinity
    let saccadeLength = 90
    let nextSaccade = 0
    let nextBlink = 900
    let blinkStart = -Infinity
    let blinkLength = 0
    let pendingDouble = false

    let started = 0
    let last = 0
    let frame = 0

    const random = (min: number, max: number): number => min + Math.random() * (max - min)

    /**
     * Pick somewhere to look.
     *
     * The distribution is the character. Most glances are small and near the
     * middle — a face looking at you and thinking — with a regular minority of
     * wide ones that sweep right across. Purely uniform targets look like it is
     * reading a wall of text behind you; purely small ones look nervous.
     */
    const chooseTarget = (now: number): void => {
      const mode = stateRef.current
      const watching = interactive && now - pointerAt < 3000

      if (watching && Math.random() < (mode === 'listening' ? 0.88 : 0.66)) {
        // Look at the pointer, but stop short of it. Landing exactly on the
        // cursor every time is what makes tracking feel robotic.
        toX = pointerX * random(0.75, 1)
        toY = pointerY * random(0.7, 0.95)
      } else if (mode === 'thinking') {
        // Up and away, the way anyone does while working something out.
        toX = random(-0.95, 0.95)
        toY = random(-1, -0.35)
      } else {
        const wide = Math.random() < 0.34
        toX = wide ? random(-1, 1) : random(-0.5, 0.5)
        toY = wide ? random(-0.9, 0.85) : random(-0.4, 0.35)
      }

      fromX = gazeX
      fromY = gazeY
      saccadeStart = now

      /*
       * Slower than a real eye, on purpose.
       *
       * An actual saccade is 30–80ms, and the first version used those
       * numbers. On a mark this size it looked like a twitch — the eyes were
       * simply in a different place between one glance and the next, with
       * nothing to watch in between. These are roughly three times longer, so
       * the movement is something you follow rather than something you catch
       * out of the corner of your eye.
       */
      const distance = Math.hypot(toX - fromX, toY - fromY)
      saccadeLength = 260 + distance * 190

      // A large shift often comes with a blink. Cheapest thing on the list and
      // it does more than any of the others.
      if (distance > 0.75 && Math.random() < 0.4 && blinkStart === -Infinity) {
        nextBlink = now + 90
      }

      // And it rests for longer between them. Constant motion is restless;
      // stillness with occasional movement is calm.
      const dwell =
        mode === 'listening'
          ? random(1500, 3200)
          : mode === 'thinking'
            ? random(800, 1800)
            : mode === 'speaking'
              ? random(1000, 2300)
              : random(1400, 4200)

      nextSaccade = now + saccadeLength + dwell
    }

    const scheduleBlink = (now: number): void => {
      // Three to nine seconds, and every so often a second one right after the
      // first, which is what real blinking does and no timer ever does.
      nextBlink = now + (pendingDouble ? 220 : random(3200, 9000))
      pendingDouble = false
    }

    const point = (event: PointerEvent): void => {
      const box = node.getBoundingClientRect()
      const centreX = box.left + box.width / 2
      const centreY = box.top + box.height / 2
      const reach = Math.max(window.innerWidth, window.innerHeight) * 0.48
      pointerX = Math.max(-1, Math.min(1, (event.clientX - centreX) / reach))
      pointerY = Math.max(-1, Math.min(1, (event.clientY - centreY) / reach))
      pointerAt = performance.now()
    }

    const away = (): void => {
      pointerAt = -Infinity
    }

    /*
     * The curves.
     *
     * Every movement in here runs through one of these two, and neither has a
     * corner in it. That is the whole point: a curve whose slope jumps — an
     * ease-out starting at full speed, a linear ramp stopping dead — is what
     * makes motion look mechanical, however long you make it.
     */

    /** Smootherstep. Zero velocity *and* zero acceleration at both ends. */
    const smooth = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

    /**
     * The shape of one saccade.
     *
     * Smootherstep with a gentle overshoot laid over the middle — real eyes
     * habitually land slightly past the target and settle back, and it is the
     * difference between "moved" and "looked". The overshoot is a sine, so it
     * enters and leaves at zero and never introduces a corner of its own.
     */
    const saccade = (t: number): number => smooth(t) + Math.sin(t * Math.PI) * 0.055

    const tick = (now: number): void => {
      if (!started) started = now
      if (!last) last = now
      // Clamped: coming back from a backgrounded window hands over a dt of
      // several seconds, and an unclamped spring given that explodes.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const elapsed = now - started
      const mode = stateRef.current

      if (now >= nextSaccade) chooseTarget(now)

      // --- eyes ------------------------------------------------------------
      const through = Math.min(1, (now - saccadeStart) / saccadeLength)
      const eased = saccade(through)
      gazeX = fromX + (toX - fromX) * eased
      gazeY = fromY + (toY - fromY) * eased

      // Ocular tremor: too small to see directly, very visible by its absence.
      // Long periods only — a fast one at this amplitude reads as a flicker.
      const tremorX = Math.sin(elapsed / 620) * 0.014 + Math.sin(elapsed / 233) * 0.005
      const tremorY = Math.cos(elapsed / 780) * 0.011

      // --- head ------------------------------------------------------------
      // A spring, not a chase. Under-damped on purpose: it arrives a little
      // past where it was going and rocks back, which is what a head does.
      // Thinking stiffens it; speaking loosens it and lets it move more.
      const stiffness = mode === 'thinking' ? 16 : mode === 'speaking' ? 26 : 21
      const damping = mode === 'thinking' ? 8 : 6.6
      const coupling = mode === 'thinking' ? 0.5 : 0.72

      for (const axis of [0, 1]) {
        const target = (axis === 0 ? gazeX : gazeY) * coupling
        const position = axis === 0 ? headX : headY
        const velocity = axis === 0 ? headVX : headVY
        const next = velocity + (target - position) * stiffness * dt - velocity * damping * dt
        if (axis === 0) {
          headVX = next
          headX += next * dt
        } else {
          headVY = next
          headY += next * dt
        }
      }

      // Ambient sway, independent of where it is looking, on two periods that
      // do not divide into each other — so the loop never visibly repeats.
      const swayX = Math.sin(elapsed / 7600) * 0.2 + Math.sin(elapsed / 12400) * 0.12
      const swayY = Math.cos(elapsed / 9300) * 0.17

      // Weight. A head thrown sideways dips slightly as it goes, and the roll
      // trails the movement rather than being locked to the position.
      const lean = headVX * 0.06
      const dip = Math.abs(headVX) * 0.05

      // --- blink -----------------------------------------------------------
      if (now >= nextBlink && blinkStart === -Infinity) {
        blinkStart = now
        // Slower than a real blink for the same reason as the saccades: at
        // 120ms it registered as a glitch rather than as an eye closing.
        blinkLength = random(280, 380)
        pendingDouble = Math.random() < 0.2
      }

      let lid = 1
      if (blinkStart !== -Infinity) {
        const b = (now - blinkStart) / blinkLength
        if (b >= 1) {
          blinkStart = -Infinity
          scheduleBlink(now)
        } else {
          // Down fast, up slower — the closing half of a blink is quicker.
          // Both halves run through the smooth curve, so the lid eases into
          // the closed position instead of arriving at it at full speed.
          const half = b < 0.4 ? 1 - smooth(b / 0.4) : smooth((b - 0.4) / 0.6)
          lid = 0.05 + half * 0.95
        }
      }

      // Listening opens the eyes a fraction; it is the cheapest possible way
      // to say "go on, I'm with you".
      if (mode === 'listening') lid = Math.min(1.14, lid * 1.14)

      // --- body ------------------------------------------------------------
      const level = Math.max(0, Math.min(1, getActivity?.() ?? 0))
      const breath = 1 + Math.sin(elapsed / 3200) * 0.011
      const speaking = mode === 'speaking' ? Math.sin(elapsed / 240) * 0.006 : 0

      // Units are SVG user units, which is what a CSS `px` means inside a
      // viewBox — 104px here is 104 of the 1254 the mark is drawn in, at any
      // rendered size.
      const style = node.style
      style.setProperty('--a-eye-x', `${((gazeX + tremorX) * EYE_REACH_X).toFixed(2)}px`)
      style.setProperty('--a-eye-y', `${((gazeY + tremorY) * EYE_REACH_Y).toFixed(2)}px`)
      style.setProperty('--a-head-x', `${((headX + swayX) * HEAD_REACH_X).toFixed(2)}px`)
      style.setProperty('--a-head-y', `${((headY + swayY + dip) * HEAD_REACH_Y).toFixed(2)}px`)
      style.setProperty('--a-head-r', `${((headX + lean) * HEAD_ROLL).toFixed(3)}deg`)
      style.setProperty('--a-lid', lid.toFixed(3))
      style.setProperty('--a-scale', (breath + speaking + level * 0.06).toFixed(4))
      style.setProperty('--a-level', level.toFixed(3))

      frame = requestAnimationFrame(tick)
    }

    if (interactive) {
      window.addEventListener('pointermove', point, { passive: true })
      document.addEventListener('mouseleave', away)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', point)
      document.removeEventListener('mouseleave', away)
    }
  }, [getActivity, interactive])

  return (
    <svg
      ref={ref}
      className={`assistant-logo ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 1254 1254"
      role="img"
      aria-label="Vilo"
      data-state={state}
    >
      <g className="assistant-body">
        <g className="assistant-head">
          <use href="./vilo.svg#vilo-head" />
          <g className="assistant-gaze">
            <g className="assistant-blink">
              <use href="./vilo.svg#vilo-eyes" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  )
}
