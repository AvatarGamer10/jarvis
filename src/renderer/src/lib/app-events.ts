import type { SectionId } from './nav'

const AUTH_EVENT = 'vilo:auth-changed'
const NAVIGATE_EVENT = 'vilo:navigate'

export function notifyAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_EVENT))
}

export function onAuthChanged(listener: () => void): () => void {
  window.addEventListener(AUTH_EVENT, listener)
  return () => window.removeEventListener(AUTH_EVENT, listener)
}

export function navigateTo(section: SectionId): void {
  window.dispatchEvent(new CustomEvent<SectionId>(NAVIGATE_EVENT, { detail: section }))
}

export function onNavigate(listener: (section: SectionId) => void): () => void {
  const handler = (event: Event): void => listener((event as CustomEvent<SectionId>).detail)
  window.addEventListener(NAVIGATE_EVENT, handler)
  return () => window.removeEventListener(NAVIGATE_EVENT, handler)
}
