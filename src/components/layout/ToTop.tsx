import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

/** A lime "back to top" button that appears after one screen of scrolling. */
export function ToTop() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const check = () => setOn(window.scrollY > window.innerHeight)
    check()
    window.addEventListener('scroll', check, { passive: true })
    return () => window.removeEventListener('scroll', check)
  }, [])
  return <button type="button" aria-label="Наверх" tabIndex={on ? 0 : -1} className={`gs-to-top ${on ? 'is-on' : ''}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={20} strokeWidth={2.4} /></button>
}
