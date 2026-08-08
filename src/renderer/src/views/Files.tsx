import {
  ArrowRight,
  FolderCog,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Undo2,
  RefreshCw,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FileRule, MovePlan, SafeSettings } from '@shared/types'
import { Empty, Field, SectionHead, StateNotice, Toggle } from '../components/ui'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'

type Draft = Omit<FileRule, 'id'> & { id?: string }

const emptyRule = (): Draft => ({
  enabled: true,
  name: '',
  source: '',
  destination: '',
  extensions: [],
  nameContains: ''
})

/** Shows only the tail of a long path, which is the part that distinguishes it. */
function shortPath(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? value : `…/${parts.slice(-2).join('/')}`
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/**
 * Folder rules.
 *
 * Two safety rails, both of them deliberate: Vilo can only touch folders you
 * have explicitly authorised, and nothing moves until you have seen the exact
 * list of moves. Undo puts the last batch back where it came from.
 */
export default function Files(): JSX.Element {
  const [settings, setSettings] = useState<SafeSettings | null>(null)
  const [rules, setRules] = useState<FileRule[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [plan, setPlan] = useState<MovePlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setLoadError(null)
    const [loaded, list] = await Promise.all([
      window.vilo.settings.get(),
      window.vilo.organizer.listRules()
    ])
    if (loaded.ok) setSettings(loaded.data)
    if (list.ok) setRules(list.data)
    if (!loaded.ok || !list.ok) {
      setLoadError(!loaded.ok ? loaded.error : !list.ok ? list.error : 'Unknown error')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const roots = settings?.managedRoots ?? []

  const addRoot = async (): Promise<void> => {
    const picked = await window.vilo.dialog.pickFolder()
    if (!picked.ok || !picked.data) return
    if (roots.includes(picked.data)) return

    const updated = await window.vilo.settings.update({
      managedRoots: [...roots, picked.data]
    })
    if (updated.ok) setSettings(updated.data)
  }

  const removeRoot = async (root: string): Promise<void> => {
    const updated = await window.vilo.settings.update({
      managedRoots: roots.filter((item) => item !== root)
    })
    if (updated.ok) setSettings(updated.data)
  }

  const pickInto = async (field: 'source' | 'destination'): Promise<void> => {
    const picked = await window.vilo.dialog.pickFolder()
    if (!picked.ok || !picked.data || !draft) return
    setDraft({ ...draft, [field]: picked.data })
  }

  const saveDraft = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    setError(null)

    const result = await window.vilo.organizer.saveRule(draft)
    if (result.ok) {
      setDraft(null)
      setPlan(null)
      await load()
    } else {
      setError(result.error)
    }
    setBusy(false)
  }

  const toggleRule = async (rule: FileRule, enabled: boolean): Promise<void> => {
    const result = await window.vilo.organizer.saveRule({ ...rule, enabled })
    if (result.ok) {
      setPlan(null)
      await load()
    } else {
      toast.error(result.error)
    }
  }

  const removeRule = async (rule: FileRule): Promise<void> => {
    const result = await window.vilo.organizer.deleteRule(rule.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setPlan(null)
    await load()

    toast.undoable(`Deleted “${rule.name || 'rule'}”`, async () => {
      const { id: _id, ...withoutId } = rule
      const restored = await window.vilo.organizer.saveRule(withoutId)
      if (!restored.ok) toast.error(restored.error)
      await load()
    })
  }

  const preview = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    const result = await window.vilo.organizer.plan()
    if (result.ok) {
      setPlan(result.data)
      if (result.data.moves.length === 0) {
        toast.show('No files match your rules right now.')
      }
    } else {
      setError(result.error)
    }
    setBusy(false)
  }

  const apply = async (): Promise<void> => {
    if (!plan) return
    setBusy(true)

    const result = await window.vilo.organizer.apply(plan.id)
    if (result.ok) {
      const { moved, failed } = result.data
      sound.play('done')
      toast.show(
        `${moved} file${moved === 1 ? '' : 's'} moved` +
          (failed.length > 0 ? ` · ${failed.length} had problems` : ''),
        { action: { label: 'Undo', run: undo } }
      )
      if (failed.length > 0) setError(failed[0].error)
      setPlan(null)
    } else {
      setError(result.error)
    }
    setBusy(false)
  }

  const undo = async (): Promise<void> => {
    setBusy(true)
    const result = await window.vilo.organizer.undoLast()
    if (result.ok) {
      toast.show(`${result.data.moved} file${result.data.moved === 1 ? '' : 's'} put back`)
    } else {
      toast.error(result.error)
    }
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="view scroll narrow">
        <div className="card skeleton" style={{ height: 96 }} />
        <div className="card skeleton" style={{ height: 180, marginTop: 'var(--s-6)' }} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="view scroll narrow" style={{ display: 'grid', placeItems: 'center' }}>
        <StateNotice
          tone="error"
          icon={<FolderCog />}
          title="Folder rules could not be loaded"
          hint={loadError}
          action={
            <button className="btn" onClick={() => void load()}>
              <RefreshCw />
              Try again
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="view scroll narrow">
      {error && <div className="alert error">{error}</div>}

      <section style={{ marginBottom: 'var(--s-8)' }}>
        <SectionHead
          title="Folders Vilo may touch"
          hint="Anything outside these is refused, including by the agent."
        >
          <button className="btn sm" onClick={addRoot}>
            <Plus />
            Authorise a folder
          </button>
        </SectionHead>

        {roots.length === 0 ? (
          <div className="alert">
            <ShieldCheck />
            <span>
              No folders authorised yet. Nothing can be moved until you name at least one.
            </span>
          </div>
        ) : (
          <div className="list">
            {roots.map((root) => (
              <div className="list-item" key={root}>
                <span className="source-mark">
                  <FolderOpen />
                </span>
                <span className="grow mono truncate" title={root}>
                  {root}
                </span>
                <div className="item-actions">
                  <button
                    className="btn ghost sm icon danger"
                    onClick={() => void removeRoot(root)}
                    aria-label={`Remove ${root}`}
                  >
                    <X />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 'var(--s-8)' }}>
        <SectionHead title={`Rules${rules.length ? ` · ${rules.length}` : ''}`}>
          <button
            className="btn sm"
            onClick={() => setDraft(emptyRule())}
            disabled={roots.length === 0 || draft !== null}
          >
            <Plus />
            New rule
          </button>
        </SectionHead>

        {rules.length === 0 && !draft ? (
          <Empty
            icon={<FolderCog />}
            title="No rules yet"
            hint="A rule says: take files like this, out of here, and put them there. Vilo runs them only when you ask."
            action={
              <button
                className="btn primary"
                onClick={() => setDraft(emptyRule())}
                disabled={roots.length === 0}
              >
                <Plus />
                {roots.length === 0 ? 'Authorise a folder first' : 'Create the first rule'}
              </button>
            }
          />
        ) : (
          <div className="list">
            {rules.map((rule) => (
              <div className="list-item rule-card" key={rule.id}>
                <Toggle
                  checked={rule.enabled}
                  onChange={(next) => void toggleRule(rule, next)}
                  label={`Enable ${rule.name || 'rule'}`}
                />

                <div className="grow" style={{ opacity: rule.enabled ? 1 : 0.5 }}>
                  <div className="item-title truncate">{rule.name || 'Untitled rule'}</div>
                  <div className="path-pair">
                    <span title={rule.source}>{shortPath(rule.source)}</span>
                    <ArrowRight size={12} className="arrow" />
                    <span title={rule.destination}>{shortPath(rule.destination)}</span>
                  </div>
                  {(rule.extensions.length > 0 || rule.nameContains) && (
                    <div className="item-sub truncate">
                      {rule.extensions.length > 0 && rule.extensions.join(', ')}
                      {rule.extensions.length > 0 && rule.nameContains && ' · '}
                      {rule.nameContains && `name contains “${rule.nameContains}”`}
                    </div>
                  )}
                </div>

                <div className="item-actions">
                  <button
                    className="btn ghost sm icon"
                    onClick={() => setDraft(rule)}
                    aria-label="Edit"
                  >
                    <Pencil />
                  </button>
                  <button
                    className="btn ghost sm icon danger"
                    onClick={() => void removeRule(rule)}
                    aria-label="Delete"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {draft && (
          <div className="card" style={{ marginTop: 'var(--s-3)' }}>
            <div className="col" style={{ gap: 'var(--s-4)' }}>
              <Field label="What is this rule called?">
                <input
                  className="input"
                  type="text"
                  value={draft.name}
                  autoFocus
                  placeholder="Physics PDFs"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Field>

              <div className="row" style={{ alignItems: 'stretch', gap: 'var(--s-3)' }}>
                <Field label="From">
                  <button className="btn" onClick={() => void pickInto('source')}>
                    <FolderOpen />
                    <span className="truncate">
                      {draft.source ? shortPath(draft.source) : 'Choose folder…'}
                    </span>
                  </button>
                </Field>
                <Field label="To">
                  <button className="btn" onClick={() => void pickInto('destination')}>
                    <FolderOpen />
                    <span className="truncate">
                      {draft.destination ? shortPath(draft.destination) : 'Choose folder…'}
                    </span>
                  </button>
                </Field>
              </div>

              <Field label="Extensions" hint="Comma separated. Leave empty for every file type.">
                <input
                  className="input"
                  type="text"
                  value={draft.extensions.join(', ')}
                  placeholder="pdf, docx"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      extensions: event.target.value
                        .split(',')
                        .map((part) => part.trim().replace(/^\./, ''))
                        .filter(Boolean)
                    })
                  }
                />
              </Field>

              <Field label="Name contains" hint="Leave empty to match any name.">
                <input
                  className="input"
                  type="text"
                  value={draft.nameContains}
                  placeholder="physics"
                  onChange={(event) => setDraft({ ...draft, nameContains: event.target.value })}
                />
              </Field>

              <div className="row">
                <button
                  className="btn primary"
                  disabled={busy || !draft.source || !draft.destination}
                  onClick={saveDraft}
                >
                  Save rule
                </button>
                <button className="btn" onClick={() => setDraft(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section style={{ paddingBottom: 'var(--s-8)' }}>
        <SectionHead
          title="Tidy up"
          hint="Vilo shows you every move before touching a single file."
        >
          <button className="btn ghost sm" onClick={undo} disabled={busy}>
            <Undo2 />
            Undo last run
          </button>
          <button className="btn primary sm" onClick={preview} disabled={busy || rules.length === 0}>
            <Play />
            See what would move
          </button>
        </SectionHead>

        {plan && plan.moves.length > 0 && (
          <div className="card">
            <p className="meta" style={{ marginBottom: 'var(--s-3)' }}>
              {plan.moves.length} file{plan.moves.length === 1 ? '' : 's'} would move.
              {plan.skipped > 0 && ` ${plan.skipped} left alone.`} Nothing has been touched yet.
            </p>

            <div className="panel plan-preview scroll">
              {plan.moves.slice(0, 60).map((move) => (
                <div className="plan-move" key={move.from} title={`${move.from}\n→ ${move.to}`}>
                  <span className="truncate">{fileName(move.from)}</span>
                  <ArrowRight size={12} />
                  <span className="to truncate">
                    {move.renamedTo ? `${shortPath(move.to)} (as ${move.renamedTo})` : shortPath(move.to)}
                  </span>
                </div>
              ))}
              {plan.moves.length > 60 && (
                <p className="meta" style={{ padding: 'var(--s-2)' }}>
                  …and {plan.moves.length - 60} more.
                </p>
              )}
            </div>

            <div className="row" style={{ marginTop: 'var(--s-4)' }}>
              <button className="btn primary" onClick={apply} disabled={busy}>
                Move {plan.moves.length} file{plan.moves.length === 1 ? '' : 's'}
              </button>
              <button className="btn" onClick={() => setPlan(null)} disabled={busy}>
                Discard
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
