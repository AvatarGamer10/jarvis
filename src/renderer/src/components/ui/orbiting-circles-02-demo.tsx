import OrbitingCirclesGlobe from '@/components/ui/orbiting-circles-02'

/**
 * Demo del componente, tal cual venia.
 *
 * Se queda como referencia de uso: no esta enganchada a ninguna seccion de la
 * app. Para verla, importala desde donde quieras probarla.
 */
export default function Demo(): JSX.Element {
  return (
    <div className="flex min-h-[500px] w-full items-end justify-center bg-background">
      <OrbitingCirclesGlobe />
    </div>
  )
}
