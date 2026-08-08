/**
 * The Vilo mark.
 *
 * Loaded from `public/vilo.svg` rather than inlined: it is a traced outline of
 * some forty kilobytes, which would sit in the JavaScript bundle and be parsed
 * on every launch for no reason. As a file it is cached once and the brand can
 * be swapped without touching code.
 *
 * The artwork is already white, which is what it needs to be everywhere in
 * this interface. Anything that wants it dimmer changes its opacity.
 */

interface Props {
  size?: number
  className?: string
  /** 0 to 1. The rail uses a touch under full so it sits back from the title. */
  opacity?: number
}

export default function Logo({ size = 24, className, opacity }: Props): JSX.Element {
  return (
    <img
      src="./vilo.svg"
      width={size}
      height={size}
      alt=""
      className={className}
      style={{ opacity, display: 'block' }}
      draggable={false}
    />
  )
}
