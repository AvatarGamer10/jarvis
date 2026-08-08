import { nativeImage, type NativeImage } from 'electron'

/**
 * Menu bar icon, drawn in code.
 *
 * Same reasoning as the sounds: nothing to package, no dependency on someone
 * exporting a PNG at exactly the right size, and tunable to the pixel. It
 * draws the orb — a ring with a bright core — which is the app's face
 * everywhere else.
 *
 * `createFromBitmap` wants the pixels in BGRA order.
 */

const SIZE = 32
const CHANNELS = 4

/**
 * White, because the icon is a template image.
 *
 * On macOS a template image is recoloured by the system from its alpha
 * channel, so the menu bar gets a black glyph on a light bar and a white one
 * on a dark bar without us doing anything. The RGB values are ignored there;
 * on Windows they are not, and white is right against the taskbar anyway.
 */
const INK = { r: 0xff, g: 0xff, b: 0xff }

/**
 * Anti-aliased ring coverage at a point.
 *
 * Returns 1 inside, 0 outside, and something in between at the edge. Without
 * it the icon comes out with jagged edges, which at 32 px is very obvious.
 */
function ringCoverage(
  distance: number,
  outerRadius: number,
  innerRadius: number
): number {
  const feather = 1
  const outside = Math.min(1, Math.max(0, (outerRadius - distance) / feather))
  const inside = Math.min(1, Math.max(0, (distance - innerRadius) / feather))
  return Math.min(outside, inside)
}

export function createTrayIcon(): NativeImage {
  const buffer = Buffer.alloc(SIZE * SIZE * CHANNELS)
  const centre = (SIZE - 1) / 2

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - centre
      const dy = y - centre
      const distance = Math.hypot(dx, dy)

      // Ring plus core: the voice orb, at menu bar scale.
      const ring = ringCoverage(distance, 14, 10.5)
      const core = Math.min(1, Math.max(0, (3.6 - distance) / 1))
      const alpha = Math.min(1, ring + core)

      const i = (y * SIZE + x) * CHANNELS
      buffer[i] = INK.b
      buffer[i + 1] = INK.g
      buffer[i + 2] = INK.r
      buffer[i + 3] = Math.round(alpha * 255)
    }
  }

  const image = nativeImage.createFromBitmap(buffer, { width: SIZE, height: SIZE })
  // Lets macOS invert it for a light menu bar. On Windows this is a no-op.
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}
