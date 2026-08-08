import { AlertCircle, Check as CheckIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The small controls, gathered in one file.
 *
 * None of these are clever. They exist so that a switch is the same switch on
 * every screen, and so no view ever has to remember which four class names a
 * labelled field needs.
 */

// -------------------------------------------------------------------------
// Toggle
// -------------------------------------------------------------------------

interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}

export function Toggle({ checked, onChange, disabled, label }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      className="toggle"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  )
}

/** A switch with its explanation, which is how every one in Settings appears. */
export function SwitchRow({
  title,
  hint,
  checked,
  onChange,
  disabled
}: {
  title: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <div className="switch-row">
      <span className="switch-text">
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </span>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  )
}

// -------------------------------------------------------------------------
// Checkbox
// -------------------------------------------------------------------------

export function Check({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}): JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      className="check"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <CheckIcon strokeWidth={3} />
    </button>
  )
}

// -------------------------------------------------------------------------
// Segmented control
// -------------------------------------------------------------------------

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  label: string
}

/**
 * The selected background is one element that slides between positions,
 * measured from the real buttons after layout. Moving a single thumb is what
 * makes it feel like one control; toggling a class on each child makes it feel
 * like several buttons that happen to agree.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: SegmentedProps<T>): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const move = (): void => {
      const active = wrap.querySelector<HTMLElement>('[aria-selected="true"]')
      if (!active) return
      setThumb({ left: active.offsetLeft, width: active.offsetWidth })
    }

    move()
    // Fonts landing after first paint change the button widths, and the thumb
    // would otherwise stay measured against the fallback face.
    const observer = new ResizeObserver(move)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [value, options])

  return (
    <div className="segmented" role="tablist" aria-label={label} ref={wrapRef}>
      {thumb && (
        <span
          className="segmented-thumb"
          style={{ transform: `translateX(${thumb.left - 3}px)`, width: thumb.width }}
        />
      )}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// -------------------------------------------------------------------------
// Field
// -------------------------------------------------------------------------

export function Field({
  label,
  hint,
  children
}: {
  label?: string
  hint?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

// -------------------------------------------------------------------------
// Empty state
// -------------------------------------------------------------------------

export function Empty({
  icon,
  title,
  hint,
  action
}: {
  icon: ReactNode
  title: string
  hint: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="empty">
      <span className="empty-mark">{icon}</span>
      <h3>{title}</h3>
      <p>{hint}</p>
      {action}
    </div>
  )
}

// -------------------------------------------------------------------------
// Recoverable state
// -------------------------------------------------------------------------

export function StateNotice({
  icon,
  title,
  hint,
  action,
  tone = 'neutral',
  compact = false
}: {
  icon?: ReactNode
  title: string
  hint: string
  action?: ReactNode
  tone?: 'neutral' | 'error' | 'success'
  compact?: boolean
}): JSX.Element {
  return (
    <div className={`state-notice ${tone} ${compact ? 'compact' : ''}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className="state-notice-mark">{icon ?? <AlertCircle />}</span>
      <div className="grow">
        <strong>{title}</strong>
        <p>{hint}</p>
      </div>
      {action && <div className="state-notice-action">{action}</div>}
    </div>
  )
}

// -------------------------------------------------------------------------
// Section header
// -------------------------------------------------------------------------

export function SectionHead({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children?: ReactNode
}): JSX.Element {
  return (
    <div className="row-between" style={{ marginBottom: 'var(--s-3)' }}>
      <div>
        <h2 style={{ fontSize: 'var(--fs-h3)' }}>{title}</h2>
        {hint && <p className="meta">{hint}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  )
}
