import { CornerDownLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SECTIONS, type SectionId } from '../lib/nav'

/**
 * Cmd+K.
 *
 * It navigates and nothing else. A palette that can also run actions has to
 * explain which of its entries are safe to press, and this app already has a
 * place where destructive things get confirmed — the chat.
 */

interface Props {
  onGo: (id: SectionId) => void
  onClose: () => void
}

interface Entry {
  id: SectionId
  label: string
  hint: string
  icon: (typeof SECTIONS)[number]['icon']
  haystack: string
}

const ENTRIES: Entry[] = SECTIONS.map((section) => ({
  id: section.id,
  label: section.label,
  hint: section.tagline,
  icon: section.icon,
  haystack: `${section.label} ${section.tagline} ${section.keywords.join(' ')}`.toLowerCase()
}))

export default function CommandPalette({ onGo, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return ENTRIES

    // Every word has to appear somewhere, in any order. "set acc" finds
    // Settings; a strict prefix match would not.
    const words = needle.split(/\s+/)
    return ENTRIES.filter((entry) => words.every((word) => entry.haystack.includes(word)))
  }, [query])

  // Typing shortens the list, and the highlight has to stay on it.
  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
        event.preventDefault()
        setActive((index) => (results.length === 0 ? 0 : (index + 1) % results.length))
        return
      }

      if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
        event.preventDefault()
        setActive((index) =>
          results.length === 0 ? 0 : (index - 1 + results.length) % results.length
        )
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const chosen = results[active]
        if (chosen) onGo(chosen.id)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, active, onGo, onClose])

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div className="overlay palette-wrap" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input">
          <Search />
          <input
            ref={inputRef}
            value={query}
            placeholder="Go to…"
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="palette-list" ref={listRef}>
          {results.length === 0 && (
            <p className="meta" style={{ padding: 'var(--s-4)', textAlign: 'center' }}>
              Nothing matches “{query.trim()}”
            </p>
          )}

          {results.map((entry, index) => {
            const Icon = entry.icon
            return (
              <button
                key={entry.id}
                className="palette-item"
                data-active={index === active}
                onMouseMove={() => setActive(index)}
                onClick={() => onGo(entry.id)}
              >
                <Icon />
                {entry.label}
                <span className="palette-hint truncate">{entry.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="palette-foot">
          <span className="row">
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span className="row">
            <kbd>
              <CornerDownLeft size={10} />
            </kbd>
            open
          </span>
          <span className="row">
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
