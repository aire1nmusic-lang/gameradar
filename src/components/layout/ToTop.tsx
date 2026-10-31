import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'

/**
 * A lime "back to top" button that appears after one screen of scrolling.
 * An observed one-screen marker instead of a scroll listener: reading the viewport on every scroll step forced a layout.
 */
export function ToTop() {
  const [on, setOn] = useState(false)
  const marker = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = marker.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setOn(!entry.isIntersecting))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <>
    <div ref={marker} aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 1, height: '100vh', pointerEvents: 'none' }} />
    <button type="button" aria-label="Наверх" tabIndex={on ? 0 : -1} className={`gs-to-top ${on ? 'is-on' : ''}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={20} strokeWidth={2.4} /></button>
  </>
}
