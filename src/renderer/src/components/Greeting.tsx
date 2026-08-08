import { TextSwap } from './anim'

/**
 * What Vilo opens with.
 *
 * It starts with the plain hello and then keeps going, because a greeting
 * that says one word and stops is a screenshot. The later lines do a job the
 * paragraph underneath cannot: they tell you what this thing is for, one
 * short claim at a time, while you are still looking at the face.
 */
const GREETINGS = [
  'Hello.',
  'Good to see you.',
  'Your week, in one place.',
  'Ask me anything.',
  "Let's get you sorted."
] as const

export default function Greeting(): JSX.Element {
  return (
    <div className="greeting-slot">
      <h1 className="display-xl">
        <TextSwap phrases={GREETINGS} interval={4400} lead={1400} />
      </h1>
    </div>
  )
}
