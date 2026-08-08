import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'
import { sound } from '../lib/sound'

/**
 * Update notice.
 *
 * While it downloads it stays quiet in the corner, because there is nothing to
 * decide yet. Once it is ready it opens up with the release notes, which is
 * the only moment worth interrupting anyone for.
 */
export default function UpdateBanner(): JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    void window.vilo.updater.get().then((result) => {
      if (result.ok) setState(result.data)
    })

    return window.vilo.updater.onState((next) => {
      setState(next)
      // A newer version earns attention again, even if the last one was
      // waved away.
      if (next.phase === 'ready') {
        setDismissed(false)
        sound.play('confirm')
      }
    })
  }, [])

  const install = async (): Promise<void> => {
    setInstalling(true)
    await window.vilo.updater.installAndRestart()
  }

  if (dismissed) return null
  if (state.phase === 'idle' || state.phase === 'none' || state.phase === 'checking') return null

  // A failed check is not the user's problem: losing the connection for a
  // while is ordinary. It is visible in Settings for anyone who goes looking.
  if (state.phase === 'error') return null

  /*
   * Nothing is shown while it downloads.
   *
   * There used to be a progress panel pinned to the top right corner of every
   * screen, which is a strange place for it: it appears without being asked
   * for, it sits over the interface, and there is nothing you can do about it
   * until it finishes. The download happens quietly and the progress is in
   * Settings, at the bottom, next to the version number — where you would go
   * if you actually wanted to know.
   *
   * The one moment worth interrupting for is when it is ready, because that
   * is the first point there is a decision to make.
   */
  if (state.phase === 'downloading') return null

  return (
    <div className="floater">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h4>Version {state.version} is ready</h4>
          <p>It will be applied when Vilo restarts.</p>
        </div>
        <button
          className="btn ghost sm icon"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          <X />
        </button>
      </div>

      {state.notes && (
        <p className="mono" style={{ marginTop: 'var(--s-3)', color: 'var(--text-3)' }}>
          {state.notes}
        </p>
      )}

      <div className="floater-actions">
        <button className="btn primary sm" onClick={install} disabled={installing}>
          {installing ? 'Restarting…' : 'Restart and install'}
        </button>
        <button className="btn sm" onClick={() => setDismissed(true)} disabled={installing}>
          Later
        </button>
      </div>

      <p className="meta" style={{ marginTop: 'var(--s-2)' }}>
        Choosing later installs it the next time you quit.
      </p>
    </div>
  )
}
