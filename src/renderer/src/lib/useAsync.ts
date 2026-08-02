import { useCallback, useEffect, useState } from 'react'
import type { Result } from '@shared/types'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Ejecuta una llamada al proceso main y desempaqueta el Result.
 * Evita repetir el mismo try/catch y los tres useState en cada vista.
 */
export function useAsync<T>(fn: () => Promise<Result<T>>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    run()
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setData(result.data)
        } else {
          setError(result.error)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // Si la vista se desmonta antes de que llegue la respuesta, no tocamos
    // el estado de un componente que ya no existe.
    return () => {
      cancelled = true
    }
  }, [run, nonce])

  return { data, loading, error, reload: () => setNonce((n) => n + 1) }
}
