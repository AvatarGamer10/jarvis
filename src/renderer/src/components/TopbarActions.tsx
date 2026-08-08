import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Controls that belong to a screen but live in the window header.
 *
 * The chat's History and New chat buttons started out floating in the corner of
 * the conversation itself, which meant the transcript had to leave a hole for
 * them: messages were pushed around, and the empty state sat off-centre. A
 * screen should not have to deform to make room for its own chrome.
 *
 * So they go where every other window-level control goes — the header, on the
 * right of the page title — while the code for them stays with the screen that
 * owns them. A portal is what makes those two things possible at once.
 *
 * The slot is rendered by App. If it is not there (the HUD window, for
 * instance), nothing is rendered and nothing breaks.
 */
export const TOPBAR_SLOT = 'topbar-actions'

export default function TopbarActions({ children }: { children: ReactNode }): JSX.Element | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  // Looked up after mount, not during render: on the first pass the header has
  // not been committed to the DOM yet and the slot does not exist.
  useEffect(() => {
    setSlot(document.getElementById(TOPBAR_SLOT))
  }, [])

  if (!slot) return null
  return createPortal(children, slot)
}
