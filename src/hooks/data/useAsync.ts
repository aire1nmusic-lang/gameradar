import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  reload: () => void
}

/**
 * Minimal async binding for the service layer.
 *
 * Deliberately small: no cache, no dedupe. When the real API lands this is the
 * single place to swap in TanStack Query without touching a component.
 *
 * Out-of-order responses are dropped, so fast filter typing can never paint a
 * stale result over a fresh one.
 */
export function useAsync<T>(factory: () => Promise<T>, deps: unknown[], keepPrevious = false): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [nonce, setNonce] = useState(0)

  const requestId = useRef(0)
  const factoryRef = useRef(factory)
  factoryRef.current = factory

  useEffect(() => {
    const id = ++requestId.current
    let active = true

    setLoading(true)
    setError(undefined)
    if (!keepPrevious) setData(undefined)

    factoryRef
      .current()
      .then((value) => {
        if (!active || id !== requestId.current) return
        setData(value)
      })
      .catch((cause: unknown) => {
        if (!active || id !== requestId.current) return
        setError(cause instanceof Error ? cause : new Error(String(cause)))
      })
      .finally(() => {
        if (!active || id !== requestId.current) return
        setLoading(false)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return { data, loading, error, reload }
}
