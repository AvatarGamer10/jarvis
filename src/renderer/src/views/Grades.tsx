import { GraduationCap, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Exam, Needed, SubjectSummary } from '@shared/types'
import { Empty, SectionHead, StateNotice } from '../components/ui'
import { LOCALE, dateShortcuts, longDate } from '../lib/dates'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'
import { dueLabel, urgencyOf } from '../lib/urgency'

const MAX_GRADE = 10

const number = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })

const isPast = (exam: Exam): boolean => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Date.parse(exam.date) < today.getTime()
}

/**
 * Exams and grades.
 *
 * Separate from Tasks because it answers a different question. A task is "what
 * do I have to do" and disappears when it is handed in; an exam is "what do I
 * have to study" first and "how am I doing" afterwards, and it never
 * disappears, because it counts towards the average.
 */
export default function Grades(): JSX.Element {
  const [exams, setExams] = useState<Exam[]>([])
  const [summary, setSummary] = useState<SubjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const result = await window.vilo.exams.list()
    if (result.ok) {
      setExams(result.data.exams)
      setSummary(result.data.summary)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const setGrade = async (id: string, grade: number | null): Promise<void> => {
    const result = await window.vilo.exams.update(id, { grade })
    if (result.ok) {
      if (grade !== null) sound.play('done')
      await load()
    } else {
      toast.error(result.error)
    }
  }

  /**
   * Delete, with a way back.
   *
   * It matters more here than in Tasks: removing an exam that already has a
   * grade moves the average for that subject, and without undo you would have
   * to remember the exact mark to put it back.
   */
  const remove = async (exam: Exam): Promise<void> => {
    sound.play('cancel')
    const result = await window.vilo.exams.remove(exam.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    await load()

    toast.undoable(`Deleted “${exam.title}”`, async () => {
      const restored = await window.vilo.exams.add({
        title: exam.title,
        subject: exam.subject,
        date: exam.date,
        weight: exam.weight,
        grade: exam.grade
      })
      if (!restored.ok) toast.error(restored.error)
      await load()
    })
  }

  const awaitingGrade = exams.filter((exam) => exam.grade === null && isPast(exam))
  const upcoming = exams.filter((exam) => exam.grade === null && !isPast(exam))
  const marked = exams.filter((exam) => exam.grade !== null).reverse()

  return (
    <div className="view scroll">
      <div className="filters">
        <span className="spacer" />
        <button className="btn primary" onClick={() => setAdding((open) => !open)}>
          <Plus />
          Add exam
        </button>
      </div>

      {adding && (
        <AddExam
          onCancel={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false)
            await load()
          }}
        />
      )}

      {error ? (
        <StateNotice
          tone="error"
          icon={<GraduationCap />}
          title="Grades could not be loaded"
          hint={error}
          action={
            <button className="btn" onClick={() => void load()}>
              <RefreshCw />
              Try again
            </button>
          }
        />
      ) : loading ? (
        <div className="subject-grid">
          {[0, 1, 2].map((index) => (
            <div className="card skeleton" key={index} style={{ height: 116 }} />
          ))}
        </div>
      ) : exams.length === 0 ? (
        <Empty
          icon={<GraduationCap />}
          title="No exams yet"
          hint="Write one down as soon as you get a date. The study planner puts exams ahead of everything else, so it needs to know."
          action={
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Plus />
              Add an exam
            </button>
          }
        />
      ) : (
        <>
          {summary.length > 0 && (
            <>
              <SectionHead title="How you're doing" />
              <div className="subject-grid stagger">
                {summary.map((subject) => (
                  <SubjectCard key={subject.subject} summary={subject} />
                ))}
              </div>
            </>
          )}

          {awaitingGrade.length > 0 && (
            <div style={{ marginBottom: 'var(--s-6)' }}>
              <SectionHead
                title="Already sat — what did you get?"
                hint="Adding the mark is what makes the average and the target worth reading."
              />
              <div className="list">
                {awaitingGrade.map((exam) => (
                  <div className="list-item" key={exam.id}>
                    <div className="grow">
                      <div className="item-title truncate">{exam.title}</div>
                      <div className="item-sub">
                        {longDate(exam.date)}
                        {exam.subject && ` · ${exam.subject}`}
                      </div>
                    </div>
                    <GradeField onSave={(grade) => void setGrade(exam.id, grade)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 'var(--s-6)' }}>
            <SectionHead title={`Coming up${upcoming.length ? ` · ${upcoming.length}` : ''}`} />
            {upcoming.length === 0 ? (
              <p className="meta">Nothing on the horizon.</p>
            ) : (
              <div className="list">
                {upcoming.map((exam) => (
                  <div className="list-item" key={exam.id} data-urgency={urgencyOf(exam.date)}>
                    <div className="grow">
                      <div className="item-title truncate">{exam.title}</div>
                      <div className="item-sub">
                        {dueLabel(exam.date)}
                        {exam.subject && ` · ${exam.subject}`}
                      </div>
                    </div>
                    {exam.weight !== null && <span className="badge quiet">{exam.weight}%</span>}
                    <div className="item-actions">
                      <button
                        className="btn ghost sm icon danger"
                        onClick={() => void remove(exam)}
                        aria-label="Delete"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {marked.length > 0 && (
            <div style={{ paddingBottom: 'var(--s-8)' }}>
              <SectionHead title={`Marked · ${marked.length}`} />
              <div className="list">
                {marked.map((exam) => (
                  <div className="list-item" key={exam.id}>
                    <div className="grow">
                      <div className="item-title truncate">{exam.title}</div>
                      <div className="item-sub">
                        {longDate(exam.date)}
                        {exam.subject && ` · ${exam.subject}`}
                        {exam.weight !== null && ` · ${exam.weight}%`}
                      </div>
                    </div>
                    <span className="badge solid grade-pill">
                      {number.format(exam.grade as number)}
                    </span>
                    <div className="item-actions">
                      <button
                        className="btn ghost sm"
                        onClick={() => void setGrade(exam.id, null)}
                      >
                        Clear mark
                      </button>
                      <button
                        className="btn ghost sm icon danger"
                        onClick={() => void remove(exam)}
                        aria-label="Delete"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * One subject, with its average set large.
 *
 * The number is not coloured red or green. Red and orange belong to the
 * urgency ramp and mean "time is running out" — if a fail were red too, the
 * signal would stop meaning anything. The sentence underneath says what the
 * colour would have, and says it more precisely.
 */
function SubjectCard({ summary }: { summary: SubjectSummary }): JSX.Element {
  const { average, weighted, done, pending, needed } = summary

  return (
    <div className="card subject-card">
      <span className="subject-name truncate">{summary.subject}</span>

      <span className={`subject-avg ${average === null ? 'none' : ''}`}>
        {average === null ? '—' : number.format(average)}
        {average !== null && <small>/ {MAX_GRADE}</small>}
      </span>

      <span className="meta">
        {done === 0
          ? `${pending} exam${pending === 1 ? '' : 's'} to sit`
          : `${done} sat` +
            (pending > 0 ? `, ${pending} to go` : '') +
            (weighted ? ' · weighted' : done > 1 ? ' · simple mean' : '')}
      </span>

      {needed && <p className="need-line">{needText(needed)}</p>}
    </div>
  )
}

function needText(need: Needed): JSX.Element {
  if (need.state === 'safe') return <>You have already passed, whatever happens next.</>
  if (need.state === 'impossible') return <>A pass is no longer reachable with what is left.</>
  return (
    <>
      You need <strong>{number.format(need.grade)}</strong> on average in what is left to pass.
    </>
  )
}

/**
 * The mark field for an exam already sat.
 *
 * Local state so typing does not repaint the whole list on every keystroke.
 */
function GradeField({ onSave }: { onSave: (grade: number) => void }): JSX.Element {
  const [value, setValue] = useState('')
  const valid = value !== '' && Number(value) >= 0 && Number(value) <= MAX_GRADE

  const save = (): void => {
    if (!valid) return
    onSave(Number(value))
    setValue('')
  }

  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <input
        className="input"
        type="number"
        min={0}
        max={MAX_GRADE}
        step={0.1}
        value={value}
        placeholder="0–10"
        style={{ width: 84 }}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save()
        }}
      />
      <button className="btn primary sm" onClick={save} disabled={!valid}>
        Save
      </button>
    </div>
  )
}

function AddExam({
  onAdded,
  onCancel
}: {
  onAdded: () => void | Promise<void>
  onCancel: () => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [date, setDate] = useState('')
  const [weight, setWeight] = useState('')
  const [busy, setBusy] = useState(false)
  const shortcuts = useMemo(() => dateShortcuts(), [])

  const submit = async (): Promise<void> => {
    if (!title.trim() || !date || busy) return
    setBusy(true)

    const result = await window.vilo.exams.add({
      title,
      subject,
      // Mid-morning: the exact hour is unknown, but an exam is not at
      // midnight, and the planner uses this instant as the cut-off for study.
      date: new Date(`${date}T09:00`).toISOString(),
      weight: weight ? Number(weight) : null
    })

    if (result.ok) {
      sound.play('confirm')
      await onAdded()
    } else {
      toast.error(result.error)
      setBusy(false)
    }
  }

  return (
    <div className="add-row">
      <div className="col grow" style={{ gap: 8 }}>
        <input
          className="input"
          type="text"
          value={title}
          autoFocus
          placeholder="Which exam? e.g. Unit 4: kinematics"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
            if (event.key === 'Escape') onCancel()
          }}
        />

        <div className="row">
          <input
            className="input"
            type="text"
            value={subject}
            placeholder="Subject"
            onChange={(event) => setSubject(event.target.value)}
          />
          <input
            className="input"
            type="date"
            style={{ width: 156 }}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <input
            className="input"
            type="number"
            min={1}
            max={100}
            style={{ width: 96 }}
            value={weight}
            placeholder="% of term"
            onChange={(event) => setWeight(event.target.value)}
          />
        </div>

        <div className="date-shortcuts">
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.id}
              type="button"
              className="chip"
              aria-pressed={date === shortcut.value}
              onClick={() => setDate(date === shortcut.value ? '' : shortcut.value)}
            >
              {shortcut.label}
            </button>
          ))}
        </div>

        <span className="field-hint">
          The weight is optional, but it is the only thing that lets Vilo tell you what you need in
          what is left.
        </span>
      </div>

      <button className="btn primary" onClick={submit} disabled={busy || !title.trim() || !date}>
        Add
      </button>
      <button className="btn ghost icon" onClick={onCancel} aria-label="Cancel">
        <X />
      </button>
    </div>
  )
}
