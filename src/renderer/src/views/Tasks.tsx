import {
  Clipboard,
  ExternalLink,
  ListTodo,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Assignment, ManualTask } from '@shared/types'
import PasteClassroom from '../components/PasteClassroom'
import { Check, Empty, Segmented, StateNotice } from '../components/ui'
import { navigateTo } from '../lib/app-events'
import { dateShortcuts, toInputDate } from '../lib/dates'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'
import { daysUntil, dueLabel, urgencyOf } from '../lib/urgency'

type Filter = 'open' | 'done' | 'all'

/** How long the strike-through plays before the task moves. */
const STRIKE_MS = 400

/** A stored date, in the format an <input type="date"> wants. */
const toField = (iso: string | null): string => (iso ? toInputDate(new Date(iso)) : '')

/** And back again: end of day, which is when something is actually due. */
const toIso = (value: string): string | null =>
  value ? new Date(`${value}T23:59`).toISOString() : null

/**
 * Search without accents or case.
 *
 * Someone typing "fisica" expects to find "Física", and making people reach
 * for the accent key just to search is hostile.
 */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

/**
 * Everything you owe, from both sources, in one list.
 *
 * The old build kept manual tasks and Classroom assignments in separate cards,
 * which meant reading two lists and doing the merge in your head. They are the
 * same thing to the person who has to hand them in, so they are one list here,
 * sorted by when they are due.
 */
export default function Tasks(): JSX.Element {
  const [manual, setManual] = useState<ManualTask[]>([])
  const [classroom, setClassroom] = useState<Assignment[]>([])
  const [classroomError, setClassroomError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  /** Tasks mid-strike, not yet moved. */
  const [striking, setStriking] = useState<string[]>([])

  const load = async (): Promise<void> => {
    // The two sources are fetched separately on purpose: Classroom failing —
    // an unapproved account, an expired session — must not leave someone
    // without the tasks they wrote down themselves.
    const [tasks, assignments] = await Promise.all([
      window.vilo.tasks.list(),
      window.vilo.classroom.list()
    ])

    if (tasks.ok) setManual(tasks.data)
    else toast.error(tasks.error)

    if (assignments.ok) {
      setClassroom(assignments.data)
      setClassroomError(null)
    } else {
      setClassroom([])
      setClassroomError(assignments.error)
    }

    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  /**
   * Complete a task.
   *
   * The strike-through plays before the reload. If the list reordered
   * instantly, the task would leap somewhere else and there would be no way to
   * see what had happened to it.
   */
  const complete = async (task: ManualTask): Promise<void> => {
    if (task.done) {
      await window.vilo.tasks.update(task.id, { done: false })
      await load()
      return
    }

    sound.play('done')
    setStriking((list) => [...list, task.id])
    await new Promise((done) => setTimeout(done, STRIKE_MS))

    const result = await window.vilo.tasks.update(task.id, { done: true })
    if (!result.ok) toast.error(result.error)
    setStriking((list) => list.filter((id) => id !== task.id))
    await load()
  }

  /**
   * Delete, with a way back.
   *
   * There is no bin in the store, so undo re-creates the task with the same
   * fields. The id changes, which is visible nowhere; what matters is not
   * losing what you wrote to one bad click.
   */
  const remove = async (task: ManualTask): Promise<void> => {
    sound.play('cancel')
    const result = await window.vilo.tasks.remove(task.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    await load()

    toast.undoable(`Deleted “${task.title}”`, async () => {
      const restored = await window.vilo.tasks.add({
        title: task.title,
        subject: task.subject,
        dueDate: task.dueDate
      })
      if (!restored.ok) {
        toast.error(restored.error)
        return
      }
      if (task.done) await window.vilo.tasks.update(restored.data.id, { done: true })
      await load()
    })
  }

  const saveEdit = async (
    id: string,
    changes: { title: string; subject: string; due: string }
  ): Promise<void> => {
    const result = await window.vilo.tasks.update(id, {
      title: changes.title,
      subject: changes.subject,
      dueDate: toIso(changes.due)
    })
    if (result.ok) {
      setEditing(null)
      await load()
    } else {
      toast.error(result.error)
    }
  }

  const needle = normalise(query.trim())
  const matches = (...fields: (string | null | undefined)[]): boolean =>
    needle === '' || fields.some((field) => field && normalise(field).includes(needle))

  /**
   * The merged list.
   *
   * Classroom assignments that are already handed in never appear: they are
   * not work, they are history, and Classroom itself is the place to look at
   * that.
   */
  const rows = useMemo(() => {
    const openClassroom = classroom.filter(
      (item) => item.state === 'PENDIENTE' || item.state === 'ATRASADA'
    )

    const all = [
      ...manual.map((task) => ({
        kind: 'manual' as const,
        id: task.id,
        title: task.title,
        subject: task.subject,
        due: task.dueDate,
        done: task.done,
        task
      })),
      ...openClassroom.map((item) => ({
        kind: 'classroom' as const,
        id: item.id,
        title: item.title,
        subject: item.courseName,
        due: item.dueDate,
        done: false,
        assignment: item
      }))
    ]

    return all
      .filter((row) => matches(row.title, row.subject))
      .filter((row) => (filter === 'all' ? true : filter === 'done' ? row.done : !row.done))
      .sort((a, b) => {
        // Done sinks. Then soonest first, with undated work last: something
        // with no deadline is never the most urgent thing you have.
        if (a.done !== b.done) return a.done ? 1 : -1
        const left = daysUntil(a.due)
        const right = daysUntil(b.due)
        if (left === null) return right === null ? 0 : 1
        if (right === null) return -1
        return left - right
      })
    // `matches` closes over `needle`, which is derived from query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, classroom, filter, needle])

  const openCount = manual.filter((t) => !t.done).length + classroom.filter(
    (a) => a.state === 'PENDIENTE' || a.state === 'ATRASADA'
  ).length
  const total = openCount + manual.filter((t) => t.done).length

  return (
    <div className="view scroll">
      <div className="filters">
        <Segmented
          label="Which tasks"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: `Open${openCount > 0 ? ` · ${openCount}` : ''}` },
            { value: 'done', label: 'Done' },
            { value: 'all', label: 'All' }
          ]}
        />

        {/* The search box only turns up once there are enough tasks to need
            it. With four, it takes space and solves nothing. */}
        {total >= 8 && (
          <div className="search" style={{ width: 220 }}>
            <Search />
            <input
              className="input"
              type="text"
              value={query}
              placeholder="Search"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}

        <span className="spacer" />

        <button className="btn ghost icon" onClick={load} aria-label="Refresh">
          <RefreshCw />
        </button>
        <button className="btn" onClick={() => setPasting(true)}>
          <Clipboard />
          Paste from Classroom
        </button>
        <button className="btn primary" onClick={() => setAdding((open) => !open)}>
          <Plus />
          Add task
        </button>
      </div>

      {adding && (
        <AddTask
          onCancel={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false)
            await load()
          }}
        />
      )}

      {classroomError && (
        <StateNotice
          compact
          title="Classroom is unavailable — your own tasks are still here"
          hint={classroomError}
          action={
            <div className="row">
              <button className="btn sm" onClick={() => void load()}>Try again</button>
              <button className="btn ghost sm" onClick={() => navigateTo('settings')}>
                Open settings
              </button>
            </div>
          }
        />
      )}

      {loading ? (
        <div className="list">
          {[0, 1, 2, 3].map((index) => (
            <div className="list-item" key={index}>
              <div className="skeleton" style={{ width: 18, height: 18 }} />
              <div className="skeleton grow" style={{ height: 13 }} />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        needle ? (
          <Empty
            icon={<Search />}
            title="Nothing matches"
            hint={`No task contains “${query.trim()}”.`}
            action={
              <button className="btn" onClick={() => setQuery('')}>
                Clear the search
              </button>
            }
          />
        ) : (
          <Empty
            icon={<ListTodo />}
            title={filter === 'done' ? 'Nothing finished yet' : 'Nothing to hand in'}
            hint={
              filter === 'done'
                ? 'Tasks you tick off end up here.'
                : 'Write down what you have been set and Vilo will keep track of when it is due.'
            }
            action={
              filter !== 'done' && (
                <button className="btn primary" onClick={() => setAdding(true)}>
                  <Plus />
                  Add a task
                </button>
              )
            }
          />
        )
      ) : (
        <div className="list stagger">
          {rows.map((row) =>
            row.kind === 'manual' && editing === row.id ? (
              <EditTask
                key={row.id}
                task={row.task}
                onSave={(changes) => void saveEdit(row.id, changes)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div
                key={row.id}
                className={`list-item ${row.done || striking.includes(row.id) ? 'done' : ''}`}
                data-urgency={row.done ? undefined : urgencyOf(row.due)}
              >
                {row.kind === 'manual' ? (
                  <Check
                    checked={row.done}
                    onChange={() => void complete(row.task)}
                    label={row.done ? `Reopen ${row.title}` : `Complete ${row.title}`}
                  />
                ) : (
                  <span className="source-mark" title="From Google Classroom">
                    <ExternalLink />
                  </span>
                )}

                <div className="grow">
                  <div className="item-title truncate">{row.title}</div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="item-sub">{dueLabel(row.due)}</span>
                    {row.subject && <span className="item-sub truncate">· {row.subject}</span>}
                  </div>
                </div>

                {row.kind === 'classroom' && row.assignment.state === 'ATRASADA' && (
                  <span className="badge solid">Late</span>
                )}

                <div className="item-actions">
                  {row.kind === 'manual' ? (
                    <>
                      <button
                        className="btn ghost sm icon"
                        onClick={() => setEditing(row.id)}
                        aria-label="Edit"
                      >
                        <Pencil />
                      </button>
                      <button
                        className="btn ghost sm icon danger"
                        onClick={() => void remove(row.task)}
                        aria-label="Delete"
                      >
                        <Trash2 />
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn ghost sm icon"
                      onClick={() => void window.vilo.shell.openExternal(row.assignment.link)}
                      aria-label="Open in Classroom"
                    >
                      <ExternalLink />
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {pasting && <PasteClassroom onClose={() => setPasting(false)} onCreated={load} />}
    </div>
  )
}

/** The inline add row. Kept inline so it never covers the list it adds to. */
function AddTask({
  onAdded,
  onCancel
}: {
  onAdded: () => void | Promise<void>
  onCancel: () => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const shortcuts = useMemo(() => dateShortcuts(), [])

  const submit = async (): Promise<void> => {
    if (!title.trim() || busy) return
    setBusy(true)

    const result = await window.vilo.tasks.add({ title, subject, dueDate: toIso(due) })
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
          placeholder="What needs doing?"
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
            value={due}
            onChange={(event) => setDue(event.target.value)}
          />
        </div>

        {/* Almost everything is due today, tomorrow or on Friday. Opening a
            calendar for that is one gesture too many, four times in five. */}
        <div className="date-shortcuts">
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.id}
              type="button"
              className="chip"
              aria-pressed={due === shortcut.value}
              onClick={() => setDue(due === shortcut.value ? '' : shortcut.value)}
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      </div>

      <button className="btn primary" onClick={submit} disabled={busy || !title.trim()}>
        Add
      </button>
      <button className="btn ghost icon" onClick={onCancel} aria-label="Cancel">
        <X />
      </button>
    </div>
  )
}

/**
 * A task being edited where it sits.
 *
 * It used to take a delete and a re-create just to correct a date. The fields
 * are local state so typing does not repaint the whole list.
 */
function EditTask({
  task,
  onSave,
  onCancel
}: {
  task: ManualTask
  onSave: (changes: { title: string; subject: string; due: string }) => void
  onCancel: () => void
}): JSX.Element {
  const [title, setTitle] = useState(task.title)
  const [subject, setSubject] = useState(task.subject)
  const [due, setDue] = useState(toField(task.dueDate))

  const save = (): void => {
    if (!title.trim()) return
    onSave({ title, subject, due })
  }

  return (
    <div className="list-item" style={{ alignItems: 'flex-start', padding: 'var(--s-3)' }}>
      <div className="col grow" style={{ gap: 8 }}>
        <input
          className="input"
          type="text"
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
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
            value={due}
            onChange={(event) => setDue(event.target.value)}
          />
        </div>
      </div>

      <button className="btn primary sm" onClick={save} disabled={!title.trim()}>
        Save
      </button>
      <button className="btn ghost sm icon" onClick={onCancel} aria-label="Cancel">
        <X />
      </button>
    </div>
  )
}
