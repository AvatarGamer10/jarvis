import { useEffect, useState } from 'react'
import type { AuthStatus, SafeSettings } from '@shared/types'
import { useAsync } from '../lib/useAsync'

export default function Ajustes(): JSX.Element {
  const settingsState = useAsync<SafeSettings>(() => window.jarvis.settings.get())
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  // Campos del formulario. Los secretos empiezan vacios: si el usuario no
  // escribe nada, no se envian y el valor guardado se queda como esta.
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [model, setModel] = useState('')
  const [briefTime, setBriefTime] = useState('07:30')

  const settings = settingsState.data

  useEffect(() => {
    if (!settings) return
    setClientId(settings.googleClientId)
    setModel(settings.geminiModel)
    setBriefTime(settings.dailyBriefTime)
  }, [settings])

  const refreshStatus = async (): Promise<void> => {
    const result = await window.jarvis.auth.status()
    setStatus(result.ok ? result.data : { connected: false, email: null, error: result.error })
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  const save = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const patch: Record<string, string> = {
      googleClientId: clientId.trim(),
      geminiModel: model.trim(),
      dailyBriefTime: briefTime
    }
    if (clientSecret.trim()) patch.googleClientSecret = clientSecret.trim()
    if (geminiKey.trim()) patch.geminiApiKey = geminiKey.trim()

    const result = await window.jarvis.settings.update(patch)
    if (result.ok) {
      setClientSecret('')
      setGeminiKey('')
      setMessage({ kind: 'info', text: 'Ajustes guardados.' })
      settingsState.reload()
    } else {
      setMessage({ kind: 'error', text: result.error })
    }
    setBusy(false)
  }

  const connect = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const result = await window.jarvis.auth.signIn()
    if (result.ok) {
      setStatus(result.data)
      setMessage({ kind: 'info', text: `Conectado como ${result.data.email ?? 'tu cuenta'}.` })
    } else {
      setMessage({ kind: 'error', text: result.error })
    }
    setBusy(false)
  }

  const disconnect = async (): Promise<void> => {
    setBusy(true)
    await window.jarvis.auth.signOut()
    await refreshStatus()
    setMessage({ kind: 'info', text: 'Sesion cerrada.' })
    setBusy(false)
  }

  if (settingsState.loading) return <p className="empty">Cargando ajustes…</p>

  return (
    <>
      <h1 className="page-title">Ajustes</h1>
      <p className="page-subtitle">Credenciales y comportamiento del asistente.</p>

      {message && <div className={`alert ${message.kind}`}>{message.text}</div>}

      <div className="card">
        <h3>Cuenta de Google</h3>
        <div className="row" style={{ marginBottom: 14 }}>
          {status?.connected ? (
            <>
              <span className="badge ok">Conectado</span>
              <span className="meta">{status.email}</span>
            </>
          ) : (
            <>
              <span className="badge dim">Sin conectar</span>
              {status?.error && <span className="meta">{status.error}</span>}
            </>
          )}
        </div>

        <div className="field">
          <label htmlFor="clientId">Client ID</label>
          <input
            id="clientId"
            type="text"
            value={clientId}
            placeholder="000000000000-xxxx.apps.googleusercontent.com"
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="clientSecret">Client Secret</label>
          <input
            id="clientSecret"
            type="password"
            value={clientSecret}
            placeholder={settings?.hasGoogleClientSecret ? '•••••••• (guardado)' : 'Sin configurar'}
            onChange={(e) => setClientSecret(e.target.value)}
          />
          <p className="hint">
            Se guarda cifrado con el llavero del sistema. Dejalo en blanco para no cambiarlo.
          </p>
        </div>

        <div className="row">
          {status?.connected ? (
            <button onClick={disconnect} disabled={busy}>
              Cerrar sesion
            </button>
          ) : (
            <button className="primary" onClick={connect} disabled={busy || !clientId}>
              Conectar con Google
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Gemini</h3>
        <div className="field">
          <label htmlFor="geminiKey">API key</label>
          <input
            id="geminiKey"
            type="password"
            value={geminiKey}
            placeholder={settings?.hasGeminiApiKey ? '•••••••• (guardada)' : 'Sin configurar'}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
          <p className="hint">
            Se consigue en{' '}
            <button
              className="link"
              onClick={() => void window.jarvis.shell.openExternal('https://aistudio.google.com/apikey')}
            >
              aistudio.google.com/apikey
            </button>
          </p>
        </div>

        <div className="field">
          <label htmlFor="model">Modelo</label>
          <input id="model" type="text" value={model} onChange={(e) => setModel(e.target.value)} />
          <p className="hint">
            Los modelos Flash son los que tienen cuota gratuita amplia (~1.000-1.500 peticiones al dia).
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Resumen diario</h3>
        <div className="field">
          <label htmlFor="briefTime">Hora del aviso</label>
          <input
            id="briefTime"
            type="time"
            value={briefTime}
            onChange={(e) => setBriefTime(e.target.value)}
          />
        </div>
      </div>

      <button className="primary" onClick={save} disabled={busy}>
        Guardar ajustes
      </button>
    </>
  )
}
