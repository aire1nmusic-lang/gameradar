import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'gamescout:favorites'
// Retained only to migrate users' existing saved favorites.
const LEGACY_KEY = 'gameradar:favorites'

function read(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    const values = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
    if (!window.localStorage.getItem(KEY) && raw) window.localStorage.setItem(KEY, JSON.stringify(values))
    return values
  } catch {
    return []
  }
}

let snapshot: string[] = read()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function write(next: string[]) {
  snapshot = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* prototype: storage is optional */
  }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useFavorites() {
  const favorites = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  )

  const toggle = useCallback((slug: string) => {
    write(snapshot.includes(slug) ? snapshot.filter((s) => s !== slug) : [...snapshot, slug])
  }, [])

  const has = useCallback((slug: string) => favorites.includes(slug), [favorites])

  const clear = useCallback(() => write([]), [])

  return { favorites, toggle, has, clear }
}
