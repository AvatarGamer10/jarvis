import { useEffect, useState } from 'react'
import Logo from './Logo'
import { sound } from '../lib/sound'

interface Release {
  version: string
  title: string
  points: string[]
}

/**
 * What changed, once after each update.
 *
 * Vilo updates itself in the background, so without this you would open it one
 * morning and find a section that was not there yesterday. The update banner
 * says what is coming; this says what has already arrived.
 *
 * It is marked as seen on close, not on open: if the app is killed while it is
 * on screen, it comes back rather than being lost.
 */
export default function WhatsNew(): JSX.Element | null {
  const [releases, setReleases] = useState<Release[]>([])

  useEffect(() => {
    void window.vilo.whatsNew.pending().then((result) => {
      if (result.ok && result.data.length > 0) {
        setReleases(result.data)
        sound.play('confirm')
      }
    })
  }, [])

  if (releases.length === 0) return null

  const close = async (): Promise<void> => {
    sound.play('nav')
    setReleases([])
    await window.vilo.whatsNew.markSeen()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="What's new">
      <div className="dialog" style={{ maxWidth: 460 }}>
        <div className="dialog-head" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--s-3)' }}>
            <Logo size={40} opacity={0.9} />
          </div>
          <span className="label">Updated</span>
          <h2 className="display" style={{ fontSize: 24, marginTop: 6 }}>
            {releases[0].title}
          </h2>
        </div>

        <div className="dialog-body">
          {releases.map((release) => (
            <div key={release.version}>
              {/* The version number only shows when there are several. With
                  one, the title already says it and repeating it is noise. */}
              {releases.length > 1 && (
                <div className="mono" style={{ marginTop: 'var(--s-3)' }}>
                  {release.version}
                </div>
              )}
              <ul style={{ paddingLeft: 'var(--s-4)', lineHeight: 1.8, fontSize: 'var(--fs-sm)' }}>
                {release.points.map((point) => (
                  <li key={point} className="dim">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="dialog-foot" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={close} autoFocus>
            Get started
          </button>
        </div>
      </div>
    </div>
  )
}
