import { useEffect, useState } from 'react'
import type { FileRule, MovePlan, SafeSettings } from '@shared/types'

const emptyRule = (): Omit<FileRule, 'id'> => ({
  enabled: true,
  name: '',
  source: '',
  destination: '',
  extensions: [],
  nameContains: ''
})

/** Muestra solo el final de una ruta larga, que es la parte que distingue. */
function shortPath(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? value : `…${parts.slice(-2).join('\\')}`
}

export default function Carpetas(): JSX.Element {
  const [settings, setSettings] = useState<SafeSettings | null>(null)
  const [rules, setRules] = useState<FileRule[]>([])
  const [draft, setDraft] = useState<(Omit<FileRule, 'id'> & { id?: string }) | null>(null)
  const [plan, setPlan] = useState<MovePlan | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async (): Promise<void> => {
    const [s, r] = await Promise.all([
      window.jarvis.settings.get(),
      window.jarvis.organizer.listRules()
    ])
    if (s.ok) setSettings(s.data)
    if (r.ok) setRules(r.data)
  }

  useEffect(() => {
    void load()
  }, [])

  const roots = settings?.managedRoots ?? []

  const addRoot = async (): Promise<void> => {
    const picked = await window.jarvis.dialog.pickFolder()
    if (!picked.ok || !picked.data) return
    const updated = await window.jarvis.settings.update({
      managedRoots: [...roots, picked.data]
    })
    if (updated.ok) setSettings(updated.data)
  }

  const removeRoot = async (root: string): Promise<void> => {
    const updated = await window.jarvis.settings.update({
      managedRoots: roots.filter((r) => r !== root)
    })
    if (updated.ok) setSettings(updated.data)
  }

  const pickInto = async (field: 'source' | 'destination'): Promise<void> => {
    const picked = await window.jarvis.dialog.pickFolder()
    if (!picked.ok || !picked.data || !draft) return
    setDraft({ ...draft, [field]: picked.data })
  }

  const saveDraft = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    setMessage(null)
    const result = await window.jarvis.organizer.saveRule(draft)
    if (result.ok) {
      setDraft(null)
      await load()
    } else {
      setMessage({ kind: 'error', text: result.error })
    }
    setBusy(false)
  }

  const removeRule = async (id: string): Promise<void> => {
    await window.jarvis.organizer.deleteRule(id)
    setPlan(null)
    await load()
  }

  const preview = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const result = await window.jarvis.organizer.plan()
    if (result.ok) {
      setPlan(result.data)
      if (result.data.moves.length === 0) {
        setMessage({ kind: 'info', text: 'No hay ningun archivo que casa con tus reglas.' })
      }
    } else {
      setMessage({ kind: 'error', text: result.error })
    }
    setBusy(false)
  }

  const apply = async (): Promise<void> => {
    if (!plan) return
    setBusy(true)
    const result = await window.jarvis.organizer.apply(plan.id)
    if (result.ok) {
      const { moved, failed } = result.data
      setMessage({
        kind: failed.length > 0 ? 'error' : 'info',
        text:
          `${moved} archivo(s) movido(s).` +
          (failed.length > 0 ? ` ${failed.length} con problemas: ${failed[0].error}` : '')
      })
      setPlan(null)
    } else {
      setMessage({ kind: 'error', text: result.error })
    }
    setBusy(false)
  }

  const undo = async (): Promise<void> => {
    setBusy(true)
    const result = await window.jarvis.organizer.undoLast()
    setMessage(
      result.ok
        ? { kind: 'info', text: `${result.data.moved} archivo(s) devuelto(s) a su sitio.` }
        : { kind: 'error', text: result.error }
    )
    setBusy(false)
  }

  return (
    <>
      <h1 className="page-title">Carpetas</h1>
      <p className="page-subtitle">Reglas para mantener tus archivos del colegio en su sitio.</p>

      {message && <div className={`alert ${message.kind}`}>{message.text}</div>}

      <div className="card">
        <h3>Carpetas autorizadas</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          JARVIS solo puede mover archivos dentro de estas carpetas. Todo lo de fuera se rechaza.
        </p>
        {roots.length === 0 && <p className="empty">Aun no has autorizado ninguna carpeta.</p>}
        {roots.map((root) => (
          <div className="list-item" key={root}>
            <div style={{ wordBreak: 'break-all' }}>{root}</div>
            <button onClick={() => void removeRoot(root)}>Quitar</button>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <button onClick={addRoot}>Autorizar una carpeta…</button>
        </div>
      </div>

      <div className="card">
        <h3>Reglas ({rules.length})</h3>
        {rules.length === 0 && !draft && (
          <p className="empty">Sin reglas todavia. Crea la primera abajo.</p>
        )}

        {rules.map((rule) => (
          <div className="list-item" key={rule.id}>
            <div>
              <div>
                {rule.name || '(sin nombre)'}{' '}
                {!rule.enabled && <span className="badge dim">desactivada</span>}
              </div>
              <div className="meta">
                {shortPath(rule.source)} → {shortPath(rule.destination)}
                {rule.extensions.length > 0 && ` · ${rule.extensions.join(', ')}`}
                {rule.nameContains && ` · contiene "${rule.nameContains}"`}
              </div>
            </div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button onClick={() => setDraft(rule)}>Editar</button>
              <button onClick={() => void removeRule(rule.id)}>Borrar</button>
            </div>
          </div>
        ))}

        {draft ? (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div className="field">
              <label htmlFor="rule-name">Nombre de la regla</label>
              <input
                id="rule-name"
                type="text"
                value={draft.name}
                placeholder="PDFs de Fisica"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Desde</label>
              <div className="row">
                <button onClick={() => void pickInto('source')}>Elegir carpeta…</button>
                <span className="meta">{draft.source || 'sin elegir'}</span>
              </div>
            </div>

            <div className="field">
              <label>Hacia</label>
              <div className="row">
                <button onClick={() => void pickInto('destination')}>Elegir carpeta…</button>
                <span className="meta">{draft.destination || 'sin elegir'}</span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="rule-ext">Extensiones (separadas por comas, vacio = todas)</label>
              <input
                id="rule-ext"
                type="text"
                value={draft.extensions.join(', ')}
                placeholder="pdf, docx"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    extensions: e.target.value
                      .split(',')
                      .map((s) => s.trim().replace(/^\./, ''))
                      .filter(Boolean)
                  })
                }
              />
            </div>

            <div className="field">
              <label htmlFor="rule-contains">El nombre contiene (vacio = cualquiera)</label>
              <input
                id="rule-contains"
                type="text"
                value={draft.nameContains}
                placeholder="fisica"
                onChange={(e) => setDraft({ ...draft, nameContains: e.target.value })}
              />
            </div>

            <div className="row">
              <button
                className="primary"
                disabled={busy || !draft.source || !draft.destination}
                onClick={saveDraft}
              >
                Guardar regla
              </button>
              <button onClick={() => setDraft(null)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setDraft(emptyRule())} disabled={roots.length === 0}>
              Nueva regla
            </button>
            {roots.length === 0 && (
              <span className="meta" style={{ marginLeft: 10 }}>
                Autoriza una carpeta primero.
              </span>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Ordenar</h3>
        <div className="row">
          <button onClick={preview} disabled={busy || rules.length === 0}>
            Ver que se moveria
          </button>
          <button onClick={undo} disabled={busy}>
            Deshacer lo ultimo
          </button>
        </div>

        {plan && plan.moves.length > 0 && (
          <>
            <p className="hint" style={{ marginTop: 16 }}>
              {plan.moves.length} archivo(s) se moverian. Nada se ha tocado todavia.
            </p>
            {plan.moves.slice(0, 40).map((move) => (
              <div className="list-item" key={move.from}>
                <div>
                  <div>{move.from.split(/[\\/]/).pop()}</div>
                  <div className="meta">
                    {shortPath(move.to)}
                    {move.renamedTo && ` · se renombra a "${move.renamedTo}"`}
                  </div>
                </div>
                <span className="badge dim">{move.rule}</span>
              </div>
            ))}
            {plan.moves.length > 40 && (
              <p className="meta">…y {plan.moves.length - 40} mas.</p>
            )}
            <div style={{ marginTop: 14 }}>
              <button className="primary" onClick={apply} disabled={busy}>
                Aplicar estos {plan.moves.length} movimientos
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
