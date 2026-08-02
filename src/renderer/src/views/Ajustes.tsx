import { useEffect, useState } from 'react'
import type { AuthStatus, LlmProviderId, SafeSettings } from '@shared/types'
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
  const [provider, setProvider] = useState<LlmProviderId>('ollama')
  const [ollamaHost, setOllamaHost] = useState('http://127.0.0.1:11434')
  const [ollamaModel, setOllamaModel] = useState('')
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null)

  const settings = settingsState.data

  useEffect(() => {
    if (!settings) return
    setClientId(settings.googleClientId)
    setModel(settings.geminiModel)
    setBriefTime(settings.dailyBriefTime)
    setProvider(settings.llmProvider)
    setOllamaHost(settings.ollamaHost)
    setOllamaModel(settings.ollamaModel)
  }, [settings])

  const detectOllama = async (): Promise<void> => {
    setOllamaModels(null)
    const result = await window.jarvis.agent.ollamaModels()
    setOllamaModels(result.ok ? result.data : [])
  }

  useEffect(() => {
    if (provider === 'ollama') void detectOllama()
  }, [provider])

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
      llmProvider: provider,
      geminiModel: model.trim(),
      ollamaHost: ollamaHost.trim(),
      ollamaModel: ollamaModel.trim(),
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
        <h3>Cerebro</h3>
        <div className="field">
          <label>Motor de IA</label>
          <div className="row">
            <button
              className={provider === 'ollama' ? 'primary' : ''}
              onClick={() => setProvider('ollama')}
            >
              Ollama (local)
            </button>
            <button
              className={provider === 'gemini' ? 'primary' : ''}
              onClick={() => setProvider('gemini')}
            >
              Gemini (nube)
            </button>
          </div>
        </div>

        {provider === 'ollama' ? (
          <>
            <div className="field">
              <label htmlFor="ollamaHost">Direccion de Ollama</label>
              <input
                id="ollamaHost"
                type="text"
                value={ollamaHost}
                onChange={(e) => setOllamaHost(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="ollamaModel">Modelo</label>
              <input
                id="ollamaModel"
                type="text"
                value={ollamaModel}
                placeholder="llama3.1:8b"
                onChange={(e) => setOllamaModel(e.target.value)}
              />

              {ollamaModels === null && <p className="hint">Buscando Ollama…</p>}

              {ollamaModels !== null && ollamaModels.length === 0 && (
                <p className="hint">
                  No se ha encontrado Ollama en esa direccion. Comprueba que esta arrancado.
                </p>
              )}

              {ollamaModels !== null && ollamaModels.length > 0 && (
                <>
                  <p className="hint">Modelos que ya tienes descargados:</p>
                  <div className="row" style={{ marginTop: 6 }}>
                    {ollamaModels.map((name) => (
                      <button key={name} onClick={() => setOllamaModel(name)}>
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <p className="hint" style={{ marginTop: 8 }}>
                El modelo debe soportar herramientas (tool calling). `llama3.1:8b` y
                `qwen2.5:7b` funcionan bien.
              </p>
            </div>

            <button onClick={detectOllama}>Volver a buscar</button>
          </>
        ) : (
          <>
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
                  onClick={() =>
                    void window.jarvis.shell.openExternal('https://aistudio.google.com/apikey')
                  }
                >
                  aistudio.google.com/apikey
                </button>
              </p>
            </div>

            <div className="field">
              <label htmlFor="model">Modelo</label>
              <input
                id="model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <p className="hint">
                Los modelos Flash son los que tienen cuota gratuita amplia.
              </p>
            </div>
          </>
        )}
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
