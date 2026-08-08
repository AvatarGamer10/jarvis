import { useState } from 'react'
import { Check } from './ui'
import { toInputDate } from '../lib/dates'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'

interface Draft {
  title: string
  subject: string
  /** <input type="date"> format, or empty when there was no date. */
  due: string
  /** Unticked drafts are not created. They all start ticked. */
  keep: boolean
}

interface Props {
  onClose: () => void
  /** Called once tasks exist, so the list can reload. */
  onCreated: () => void | Promise<void>
}

/**
 * Paste the Classroom list.
 *
 * Plenty of schools never approve third-party apps, which leaves the Classroom
 * API shut. Copying the page and pasting it here works regardless, and it
 * recovers almost all the value of the integration without waiting on anyone's
 * administrator.
 *
 * What comes out is shown for confirmation and can be corrected before
 * anything is saved — the same rule as everything else Vilo writes.
 */
export default function PasteClassroom({ onClose, onCreated }: Props): JSX.Element {
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [source, setSource] = useState<'model' | 'text'>('text')
  const [busy, setBusy] = useState(false)

  const interpret = async (): Promise<void> => {
    if (!text.trim()) return
    setBusy(true)

    const result = await window.vilo.tasks.parsePasted(text)
    if (result.ok) {
      setSource(result.data.source)
      setDrafts(
        result.data.tasks.map((task) => ({
          title: task.title,
          subject: task.subject,
          due: task.dueDate ? toInputDate(new Date(task.dueDate)) : '',
          keep: true
        }))
      )
      if (result.data.tasks.length === 0) {
        toast.show('I could not pull any tasks out of that text.')
      }
    } else {
      toast.error(result.error)
    }
    setBusy(false)
  }

  const edit = (index: number, changes: Partial<Draft>): void => {
    setDrafts((list) =>
      list === null ? null : list.map((draft, i) => (i === index ? { ...draft, ...changes } : draft))
    )
  }

  const kept = drafts?.filter((draft) => draft.keep && draft.title.trim()) ?? []

  const create = async (): Promise<void> => {
    setBusy(true)

    // One at a time rather than in a batch: if one fails, the rest are still
    // created and only the ones that did not make it are reported.
    let created = 0
    const failed: string[] = []
    for (const draft of kept) {
      const result = await window.vilo.tasks.add({
        title: draft.title,
        subject: draft.subject,
        dueDate: draft.due ? new Date(`${draft.due}T23:59`).toISOString() : null
      })
      if (result.ok) created++
      else failed.push(draft.title)
    }

    sound.play('confirm')
    toast.show(
      `${created} task${created === 1 ? '' : 's'} added` +
        (failed.length > 0 ? ` · ${failed.length} failed` : '')
    )

    await onCreated()
    setBusy(false)
    onClose()
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="dialog"
        style={{ width: 'min(640px, 100%)' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2 style={{ fontSize: 'var(--fs-h2)' }}>Paste from Classroom</h2>
          <p className="meta" style={{ marginTop: 4, lineHeight: 1.55 }}>
            {drafts === null
              ? 'Open Classroom, select the list of assignments, copy it, and paste it here. It does not need to be tidy — the headings and status labels are my problem.'
              : drafts.length === 0
                ? 'I could not pull anything out of that text.'
                : `${drafts.length} task${drafts.length === 1 ? '' : 's'}. Nothing has been created yet — fix anything that came out wrong.`}
          </p>
        </div>

        <div className="dialog-body">
          {drafts === null ? (
            <textarea
              className="textarea"
              value={text}
              autoFocus
              style={{ minHeight: 220 }}
              placeholder={
                'Exercises from unit 5\nMaths\nDue 8 Aug\n\nText commentary\nEnglish\nDue 10 Aug'
              }
              onChange={(event) => setText(event.target.value)}
            />
          ) : (
            <>
              {drafts.length > 0 && (
                <p className="meta" style={{ marginBottom: 'var(--s-3)' }}>
                  {source === 'model'
                    ? 'Read by your model.'
                    : 'Read by text rules, with no model involved. Check the subjects — that is where it slips most.'}
                </p>
              )}

              <div className="col" style={{ gap: 'var(--s-2)' }}>
                {drafts.map((draft, index) => (
                  <div
                    key={index}
                    className="row"
                    style={{ alignItems: 'flex-start', opacity: draft.keep ? 1 : 0.42 }}
                  >
                    <Check
                      checked={draft.keep}
                      onChange={(next) => edit(index, { keep: next })}
                      label={`Add ${draft.title}`}
                    />
                    <div className="col grow" style={{ gap: 6 }}>
                      <input
                        className="input"
                        type="text"
                        value={draft.title}
                        placeholder="What needs doing"
                        onChange={(event) => edit(index, { title: event.target.value })}
                      />
                      <div className="row">
                        <input
                          className="input"
                          type="text"
                          value={draft.subject}
                          placeholder="Subject"
                          onChange={(event) => edit(index, { subject: event.target.value })}
                        />
                        <input
                          className="input"
                          type="date"
                          style={{ width: 150 }}
                          value={draft.due}
                          onChange={(event) => edit(index, { due: event.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="dialog-foot">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>

          {drafts === null ? (
            <button className="btn primary" onClick={interpret} disabled={busy || !text.trim()}>
              {busy ? 'Reading…' : 'See what comes out'}
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => setDrafts(null)} disabled={busy}>
                Back to the text
              </button>
              <button className="btn primary" onClick={create} disabled={busy || kept.length === 0}>
                Add {kept.length} task{kept.length === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
