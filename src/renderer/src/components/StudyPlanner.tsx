import { CalendarPlus, Wand2 } from 'lucide-react'
import { useState } from 'react'
import type { StudyBlock, StudyPlan } from '@shared/types'
import { Segmented } from './ui'
import { LOCALE, timeOf } from '../lib/dates'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'short'
})

interface Props {
  onClose: () => void
  /** Called after blocks land in the calendar, so the week can refresh. */
  onApplied: () => void
}

/**
 * The study planner, as a button rather than something you have to ask for.
 *
 * The agent has this as a tool, but that path only works when a model is
 * reachable and only if it thinks to reach for it. This works every time,
 * which is what the most useful feature in the app deserves.
 *
 * Nothing is written until the proposal has been seen and accepted — the same
 * rule the agent follows for anything that changes your calendar.
 */
export default function StudyPlanner({ onClose, onApplied }: Props): JSX.Element {
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [days, setDays] = useState<'3' | '7' | '14'>('7')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const calculate = async (): Promise<void> => {
    setBusy(true)
    setNote(null)
    setError(null)

    const result = await window.vilo.plan.planBlocks(Number(days))
    if (result.ok) {
      setPlan(result.data)
      if (result.data.blocks.length === 0) {
        setNote('Nothing to spread out: either there is no homework left, or there are no free gaps.')
      }
    } else {
      setError(result.error)
    }
    setBusy(false)
  }

  const apply = async (): Promise<void> => {
    if (!plan) return
    setBusy(true)

    const result = await window.vilo.plan.aplicar(plan.id)
    if (result.ok) {
      sound.play('done')
      const failed = result.data.fallos.length
      toast.show(
        `${result.data.creados} study block${result.data.creados === 1 ? '' : 's'} added` +
          (failed > 0 ? ` · ${failed} could not be created` : '')
      )
      onApplied()
      onClose()
    } else {
      setError(result.error)
      setBusy(false)
    }
  }

  // Grouped by day: a flat list of twenty blocks does not read.
  const byDay = new Map<string, StudyBlock[]>()
  for (const block of plan?.blocks ?? []) {
    const day = dayFormat.format(new Date(block.start))
    const list = byDay.get(day)
    if (list) list.push(block)
    else byDay.set(day, [block])
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <h2 style={{ fontSize: 'var(--fs-h2)' }}>Plan my study</h2>
          <p className="meta" style={{ marginTop: 4, lineHeight: 1.55 }}>
            Spreads what you still owe across the free gaps in your calendar. Most urgent first,
            and never after the deadline.
          </p>
        </div>

        <div className="dialog-body">
          {!plan && (
            <div className="row-between">
              <Segmented
                label="How far ahead"
                value={days}
                onChange={setDays}
                options={[
                  { value: '3', label: '3 days' },
                  { value: '7', label: '7 days' },
                  { value: '14', label: '14 days' }
                ]}
              />
              <button className="btn primary" onClick={calculate} disabled={busy}>
                <Wand2 />
                {busy ? 'Reading your week…' : 'Show me'}
              </button>
            </div>
          )}

          {error && <div className="alert error">{error}</div>}
          {note && <p className="meta">{note}</p>}

          {plan && plan.blocks.length > 0 && (
            <>
              <p className="meta" style={{ marginBottom: 'var(--s-3)' }}>
                {plan.blocks.length} block{plan.blocks.length === 1 ? '' : 's'}. Nothing has been
                created yet.
              </p>

              {[...byDay].map(([day, blocks]) => (
                <div key={day} style={{ marginBottom: 'var(--s-4)' }}>
                  <div className="label" style={{ marginBottom: 6 }}>
                    {day}
                  </div>
                  <div className="list">
                    {blocks.map((block) => (
                      <div className="list-item" key={block.start}>
                        <div className="grow">
                          <div className="item-title truncate">{block.task}</div>
                          {block.subject && (
                            <div className="item-sub truncate">{block.subject}</div>
                          )}
                        </div>
                        <span className="mono" style={{ whiteSpace: 'nowrap' }}>
                          {timeOf(block.start)}–{timeOf(block.end)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="dialog-foot">
          <button className="btn" onClick={onClose} disabled={busy}>
            {plan ? 'Discard' : 'Close'}
          </button>
          {plan && plan.blocks.length > 0 && (
            <button className="btn primary" onClick={apply} disabled={busy}>
              <CalendarPlus />
              Add to my calendar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
