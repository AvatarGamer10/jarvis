import { useEffect, useState } from 'react'
import type { AuthStatus, LlmProviderId, SafeSettings } from '@shared/types'
import { sound } from '../lib/sound'
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

  /**
   * Los ajustes de apariencia se aplican al pulsar, sin pasar por Guardar.
   * Son cambios que se ven al instante: pedir una confirmacion aparte para
   * algo reversible y visible seria un paso de mas.
   */
  const toggleGlass = async (): Promise<void> => {
    const next = !(settings?.glassEnabled ?? true)
    document.documentElement.dataset.glass = next ? 'on' : 'off'
    const updated = await window.jarvis.settings.update({ glassEnabled: next })
    if (updated.ok) settingsState.reload()
  }

  const cambiarFondo = async (nivel: SafeSettings['fondoIntensidad']): Promise<void> => {
    // Se aplica antes de guardar para que el cambio se vea al instante.
    document.documentElement.dataset.fondo = nivel
    sound.play('nav')
    const updated = await window.jarvis.settings.update({ fondoIntensidad: nivel })
    if (updated.ok) settingsState.reload()
  }

  const toggleSound = async (): Promise<void> => {
    const next = !(settings?.soundEnabled ?? true)
    sound.setEnabled(next)
    // Se oye el que acabas de activar: la respuesta al ajuste es el ajuste.
    if (next) sound.play('confirm')
    const updated = await window.jarvis.settings.update({ soundEnabled: next })
    if (updated.ok) settingsState.reload()
  }

  const importarJson = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const result = await window.jarvis.dialog.importGoogleJson()
    if (result.ok) {
      // null significa que el usuario cerro el dialogo: no es un error.
      if (result.data) {
        setMessage({ kind: 'info', text: 'Credenciales importadas.' })
        settingsState.reload()
      }
    } else {
      setMessage({ kind: 'error', text: result.error })
    }
    setBusy(false)
  }

  const volverAIncluidas = async (): Promise<void> => {
    setBusy(true)
    const updated = await window.jarvis.settings.update({
      googleClientId: '',
      googleClientSecret: ''
    })
    if (updated.ok) {
      setClientId('')
      setClientSecret('')
      setMessage({ kind: 'info', text: 'Se usaran las credenciales incluidas.' })
      settingsState.reload()
    }
    setBusy(false)
  }

  const exportarDatos = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const r = await window.jarvis.datos.exportar()
    if (!r.ok) setMessage({ kind: 'error', text: r.error })
    else if (r.data) {
      setMessage({ kind: 'info', text: `Copia guardada en ${r.data.ruta}` })
    }
    setBusy(false)
  }

  const importarDatos = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const r = await window.jarvis.datos.importar()
    if (!r.ok) setMessage({ kind: 'error', text: r.error })
    else if (r.data) {
      setMessage({
        kind: 'info',
        text: `Restaurados ${r.data.ficheros} fichero(s). Cierra y vuelve a abrir JARVIS para verlos.`
      })
    }
    setBusy(false)
  }

  const toggleBrief = async (): Promise<void> => {
    const updated = await window.jarvis.settings.update({
      dailyBriefEnabled: !(settings?.dailyBriefEnabled ?? true)
    })
    if (updated.ok) settingsState.reload()
  }

  const toggleStartAtLogin = async (): Promise<void> => {
    const updated = await window.jarvis.settings.update({
      startAtLogin: !(settings?.startAtLogin ?? false)
    })
    if (updated.ok) settingsState.reload()
  }

  const replayIntro = async (): Promise<void> => {
    await window.jarvis.settings.update({ onboardingDone: false })
    setMessage({ kind: 'info', text: 'La veras la proxima vez que abras JARVIS.' })
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

        <div className="row">
          {status?.connected ? (
            <button onClick={disconnect} disabled={busy}>
              Cerrar sesion
            </button>
          ) : (
            <button
              className="primary"
              onClick={connect}
              disabled={busy || !settings?.listoParaConectar}
            >
              Conectar con Google
            </button>
          )}
        </div>

        {!settings?.listoParaConectar && (
          <p className="hint" style={{ marginTop: 10 }}>
            Esta copia de JARVIS no trae credenciales incluidas. Configura las tuyas en Avanzado.
          </p>
        )}

        {/* Casi nadie necesita esto: solo quien quiera usar su propio proyecto
            de Google Cloud. Por eso va plegado y no compitiendo con el boton. */}
        <details className="avanzado">
          <summary>Usar mi propio proyecto de Google Cloud</summary>

          <p className="hint" style={{ marginTop: 12 }}>
            {settings?.usaCredencialesPropias
              ? 'Ahora mismo JARVIS usa tus credenciales.'
              : 'Ahora mismo JARVIS usa las credenciales que trae incluidas.'}
          </p>

          <div className="row" style={{ margin: '12px 0' }}>
            <button onClick={importarJson} disabled={busy}>
              Importar client_secret.json…
            </button>
            {settings?.usaCredencialesPropias && (
              <button onClick={volverAIncluidas} disabled={busy}>
                Volver a las incluidas
              </button>
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
              placeholder={
                settings?.hasGoogleClientSecret ? '•••••••• (guardado)' : 'Sin configurar'
              }
              onChange={(e) => setClientSecret(e.target.value)}
            />
            <p className="hint">
              Se guarda cifrado con el llavero del sistema. Dejalo en blanco para no cambiarlo.
            </p>
          </div>
        </details>
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
        <h3>Tus datos</h3>

        <div className="list-item">
          <div>
            <div>Guardar una copia</div>
            <div className="meta">
              Tus tareas, las reglas de carpetas y la conversacion, en un fichero.
            </div>
          </div>
          <button onClick={() => void exportarDatos()} disabled={busy}>
            Exportar
          </button>
        </div>

        <div className="list-item">
          <div>
            <div>Restaurar desde una copia</div>
            <div className="meta">Sustituye lo que tengas ahora. Hay que reiniciar despues.</div>
          </div>
          <button onClick={() => void importarDatos()} disabled={busy}>
            Importar
          </button>
        </div>

        <p className="hint" style={{ marginTop: 12 }}>
          JARVIS ya guarda una copia diaria automatica de los ultimos 14 dias, en la subcarpeta
          «copias» de sus datos. La exportacion es para llevartelos a otro ordenador.
        </p>
      </div>

      <div className="card">
        <h3>Apariencia</h3>

        <div className="list-item">
          <div>
            <div>Ventana translucida</div>
            <div className="meta">Se intuye el escritorio detras de la app.</div>
          </div>
          <button
            onClick={() => void toggleGlass()}
            aria-pressed={settings?.glassEnabled ?? true}
          >
            {settings?.glassEnabled ? 'Activada' : 'Desactivada'}
          </button>
        </div>

        <div className="list-item">
          <div>
            <div>Imagen de fondo</div>
            <div className="meta">Cuanto se aprecia el dibujo detras de la interfaz.</div>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            {(['apagado', 'sutil', 'medio', 'marcado'] as const).map((nivel) => (
              <button
                key={nivel}
                className={settings?.fondoIntensidad === nivel ? 'primary' : ''}
                onClick={() => void cambiarFondo(nivel)}
              >
                {nivel === 'apagado' ? 'Sin fondo' : nivel}
              </button>
            ))}
          </div>
        </div>

        <div className="list-item">
          <div>
            <div>Sonidos</div>
            <div className="meta">Avisos cortos al confirmar, cancelar y completar.</div>
          </div>
          <button onClick={() => void toggleSound()} aria-pressed={settings?.soundEnabled ?? true}>
            {settings?.soundEnabled ? 'Activados' : 'Desactivados'}
          </button>
        </div>

        <div className="list-item">
          <div>
            <div>Pantalla de bienvenida</div>
            <div className="meta">Volver a verla la proxima vez que abras JARVIS.</div>
          </div>
          <button onClick={() => void replayIntro()}>Mostrar</button>
        </div>
      </div>

      <div className="card">
        <h3>Resumen diario</h3>

        <div className="list-item">
          <div>
            <div>Aviso por la manana</div>
            <div className="meta">
              Notificacion con lo que entregas hoy, lo atrasado y tu calendario.
            </div>
          </div>
          <button onClick={() => void toggleBrief()}>
            {settings?.dailyBriefEnabled ? 'Activado' : 'Desactivado'}
          </button>
        </div>

        <div className="field" style={{ marginTop: 15 }}>
          <label htmlFor="briefTime">Hora del aviso</label>
          <input
            id="briefTime"
            type="time"
            value={briefTime}
            onChange={(e) => setBriefTime(e.target.value)}
          />
          <p className="hint">Se aplica al guardar los ajustes.</p>
        </div>

        <div className="list-item">
          <div>
            <div>Arrancar con el sistema</div>
            <div className="meta">
              Necesario para que el aviso salte si no has abierto JARVIS a mano.
            </div>
          </div>
          <button onClick={() => void toggleStartAtLogin()}>
            {settings?.startAtLogin ? 'Activado' : 'Desactivado'}
          </button>
        </div>

        <p className="hint" style={{ marginTop: 12 }}>
          Al cerrar la ventana JARVIS se queda en la bandeja del sistema para poder avisarte a su
          hora. Para cerrarlo del todo, usa Salir en el menu de la bandeja.
        </p>
      </div>

      <button className="primary" onClick={save} disabled={busy}>
        Guardar ajustes
      </button>
    </>
  )
}
