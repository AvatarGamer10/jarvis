import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast, type Toast } from '../lib/toast'

/** Renders whatever the toast bus is currently holding. */
export default function Toasts(): JSX.Element | null {
  const [items, setItems] = useState<Toast[]>([])

  useEffect(() => toast.subscribe(setItems), [])

  if (items.length === 0) return null

  return (
    <div className="toasts">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.kind}`}>
          <span className="toast-text truncate">{item.text}</span>

          {item.action && (
            <button
              className="btn sm"
              onClick={() => {
                // Dismissed first: the action may take a moment, and a notice
                // that lingers after being acted on reads as a failure.
                toast.dismiss(item.id)
                void item.action?.run()
              }}
            >
              {item.action.label}
            </button>
          )}

          <button
            className="btn ghost sm icon"
            onClick={() => toast.dismiss(item.id)}
            aria-label="Dismiss"
          >
            <X />
          </button>
        </div>
      ))}
    </div>
  )
}
