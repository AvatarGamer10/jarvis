import SectionIcon from './SectionIcon'
import type { SectionId } from '../lib/sections'

interface Props {
  /** De que seccion es el icono. */
  seccion: SectionId
  titulo: string
  /** Que hacer a continuacion. Sin esto, un vacio solo constata el vacio. */
  pista?: string
}

/**
 * Estado vacio con algo que decir.
 *
 * "No hay nada" es tecnicamente cierto y completamente inutil: no distingue
 * entre que aun no has apuntado nada y que lo tienes todo hecho, que son dos
 * situaciones opuestas. El icono ancla la seccion y la pista dice por donde
 * seguir.
 */
export default function Vacio({ seccion, titulo, pista }: Props): JSX.Element {
  return (
    <div className="vacio">
      <div className="vacio-icono" aria-hidden="true">
        <SectionIcon id={seccion} />
      </div>
      <p className="vacio-titulo">{titulo}</p>
      {pista && <p className="vacio-pista">{pista}</p>}
    </div>
  )
}
