import { useCallback, useEffect, useRef, useState } from 'react'
import type { Result } from '@shared/types'

interface AsyncState<T> {
  data: T | null
  /**
   * True only while there is nothing to show yet.
   *
   * Deliberately not "a request is in flight". A reload that flips this back
   * to true makes the view swap to its skeleton for a frame, which unmounts
   * everything below it — and every entrance animation on the page replays.
   * That is what made flipping one switch in Settings look like the whole
   * screen reloading.
   */
  loading: boolean
  /** A request is in flight over data that is already on screen. */
  refreshing: boolean
  error: string | null
  reload: () => void
  /** Update the local copy without a round trip, for optimistic edits. */
  set: (next: T) => void
}

/**
 * Call the main process and unwrap the Result.
 *
 * Saves repeating the same try/catch and the same three useStates in every
 * view. `set` is here so a view can apply an edit it already knows succeeded
 * without waiting for a reload — a list that flickers after every checkbox is
 * a list nobody enjoys using.
 */
export function useAsync<T>(fn: () => Promise<Result<T>>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  /** Survives re-renders, so the effect can tell a reload from a first load. */
  const seen = useRef(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  useEffect(() => {
    let cancelled = false
    setRefreshing(true)
    setError(null)

    run()
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          seen.current = true
          setData(result.data)
        } else {
          setError(result.error)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false)
      })

    // If the view unmounts before the answer arrives, do not touch the state
    // of a component that no longer exists.
    return () => {
      cancelled = true
    }
  }, [run, nonce])

  return {
    data,
    // Only the first time. Every reload after that keeps the current content
    // on screen and quietly replaces it — see the note on the interface.
    loading: refreshing && !seen.current,
    refreshing,
    error,
    reload: () => setNonce((n) => n + 1),
    set: setData
  }
}
