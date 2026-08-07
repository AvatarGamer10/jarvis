import { useEffect, useState } from 'react'
import { avisos, type Aviso } from '../lib/avisos'

/**
 * Pila de avisos flotantes, abajo a la izquierda.
 *
 * A la izquierda porque la derecha ya es de los avisos de actualizacion y del
 * boton flotante: dos cosas que aparecen solas en la misma esquina acabarian
 * tapandose la una a la otra.
 */
export default function Avisos(): JSX.Element | null {
  const [lista, setLista] = useState<Aviso[]>([])

  useEffect(() => avisos.subscribir(setLista), [])

  if (lista.length === 0) return null

  return (
    <div className="avisos">
      {lista.map((aviso) => (
        <div className="aviso" key={aviso.id} data-tipo={aviso.tipo} role="status">
          <span className="aviso-texto">{aviso.texto}</span>

          {aviso.accion && (
            <button
              className="link"
              onClick={() => {
                void aviso.accion?.ejecutar()
                avisos.cerrar(aviso.id)
              }}
            >
              {aviso.accion.etiqueta}
            </button>
          )}

          <button
            className="aviso-cerrar"
            onClick={() => avisos.cerrar(aviso.id)}
            aria-label="Cerrar el aviso"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
