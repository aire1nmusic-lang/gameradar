import { useEffect } from 'react'

/**
 * Puts a class on <body> (or <html>) while a component is mounted. Replaces `body:has(...)` selectors,
 * which make the browser re-check the whole document on every DOM change.
 */
export function useRootClass(name: string, active = true, root: 'body' | 'html' = 'body') {
  useEffect(() => {
    if (!active) return
    const element = root === 'html' ? document.documentElement : document.body
    element.classList.add(name)
    return () => element.classList.remove(name)
  }, [name, active, root])
}
