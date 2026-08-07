import { useEffect, useState } from 'react'
import { sound } from '../lib/sound'

interface Novedad {
  version: string
  titulo: string
  puntos: string[]
}

/**
 * Que hay de nuevo, una vez tras cada actualizacion.
 *
 * La app se actualiza sola y en segundo plano, asi que sin esto un dia abres
 * JARVIS y hay una seccion que ayer no estaba. El aviso del actualizador cuenta
 * lo que va a llegar; esto cuenta lo que ya esta.
 *
 * Se marca como vista al cerrarla, no al abrirla: si la app se cierra de golpe
 * mientras esta en pantalla, vuelve a salir en vez de perderse.
 */
export default function Novedades(): JSX.Element | null {
  const [novedades, setNovedades] = useState<Novedad[]>([])

  useEffect(() => {
    void window.jarvis.novedades.pendientes().then((r) => {
      if (r.ok && r.data.length > 0) {
        setNovedades(r.data)
        sound.play('confirm')
      }
    })
  }, [])

  if (novedades.length === 0) return null

  const cerrar = async (): Promise<void> => {
    sound.play('nav')
    setNovedades([])
    await window.jarvis.novedades.marcarVistas()
  }

  return (
    <div className="novedades-fondo" role="dialog" aria-modal="true" aria-label="Novedades">
      <div className="novedades">
        <div className="novedades-cabecera">
          <span className="novedades-etiqueta mono">Actualizado</span>
          <h2>{novedades[0].titulo}</h2>
        </div>

        <div className="novedades-cuerpo">
          {novedades.map((n) => (
            <div key={n.version}>
              {/* El numero de version solo se ensena cuando hay varias: con una
                  sola, el titulo ya lo dice y repetirlo es ruido. */}
              {novedades.length > 1 && <div className="novedades-version mono">{n.version}</div>}
              <ul>
                {n.puntos.map((punto) => (
                  <li key={punto}>{punto}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <button className="primary" onClick={cerrar} autoFocus>
          Empezar
        </button>
      </div>
    </div>
  )
}
