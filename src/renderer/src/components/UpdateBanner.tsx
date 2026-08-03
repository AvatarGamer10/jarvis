import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'
import { sound } from '../lib/sound'

/**
 * Aviso de actualizacion.
 *
 * Mientras descarga se queda discreto abajo a la derecha, porque no hay nada
 * que decidir. Cuando ya esta lista se abre con las notas del parche, que es
 * el unico momento en que merece la pena robar la atencion.
 */
export default function UpdateBanner(): JSX.Element | null {
  const [estado, setEstado] = useState<UpdateState>({ phase: 'idle' })
  const [descartado, setDescartado] = useState(false)
  const [instalando, setInstalando] = useState(false)

  useEffect(() => {
    void window.jarvis.updater.get().then((r) => {
      if (r.ok) setEstado(r.data)
    })

    return window.jarvis.updater.onState((nuevo) => {
      setEstado(nuevo)
      // Una version nueva vuelve a merecer atencion aunque se descartara la anterior.
      if (nuevo.phase === 'ready') {
        setDescartado(false)
        sound.play('confirm')
      }
    })
  }, [])

  const instalar = async (): Promise<void> => {
    setInstalando(true)
    await window.jarvis.updater.installAndRestart()
  }

  if (descartado) return null
  if (estado.phase === 'idle' || estado.phase === 'none' || estado.phase === 'checking') return null

  // Un fallo al comprobar no es asunto del usuario: quedarse sin internet un
  // rato es lo normal. Se ve en Ajustes si alguien lo busca.
  if (estado.phase === 'error') return null

  if (estado.phase === 'downloading') {
    return (
      <div className="update-toast">
        <div className="update-toast-text">
          Descargando la version {estado.version}… {estado.percent}%
        </div>
        <div className="update-bar">
          <div className="update-bar-fill" style={{ width: `${estado.percent}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="update-card">
      <div className="update-card-head">
        <div>
          <strong>Version {estado.version} lista</strong>
          <div className="meta">Se aplicara al reiniciar JARVIS.</div>
        </div>
        <button onClick={() => setDescartado(true)} aria-label="Cerrar el aviso">
          ✕
        </button>
      </div>

      {estado.notes && <pre className="update-notes">{estado.notes}</pre>}

      <div className="row">
        <button className="primary" onClick={instalar} disabled={instalando}>
          {instalando ? 'Reiniciando…' : 'Reiniciar e instalar'}
        </button>
        <button onClick={() => setDescartado(true)} disabled={instalando}>
          Mas tarde
        </button>
      </div>

      <p className="hint">Si eliges mas tarde, se instalara sola la proxima vez que cierres.</p>
    </div>
  )
}
