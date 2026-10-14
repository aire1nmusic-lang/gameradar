import { useEffect, useRef, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1023px)')
}

let bodyScrollLocks = 0
let unlockedOverflow = ''

export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    if (bodyScrollLocks === 0) unlockedOverflow = document.body.style.overflow
    bodyScrollLocks += 1
    document.body.style.overflow = 'hidden'
    return () => {
      bodyScrollLocks -= 1
      if (bodyScrollLocks === 0) document.body.style.overflow = unlockedOverflow
    }
  }, [locked])
}

/** Animated number used for hero / dashboard figures. */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(target * eased)
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration])

  return value
}

/** Fires once the element scrolls into view — used for reveal animations. */
export function useInView<T extends HTMLElement>(rootMargin = '-40px') {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || inView) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [inView, rootMargin])

  return { ref, inView }
}

/** Simulated async load so the prototype can show real loading states. */
export function useSimulatedLoad(delay = 650): boolean {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), delay)
    return () => window.clearTimeout(timer)
  }, [delay])
  return loading
}

/** Live-ticking "checked N seconds ago" counter. */
export function useTicker(startSeconds: number, resetAt = 60): number {
  const [seconds, setSeconds] = useState(startSeconds)
  useEffect(() => {
    setSeconds(startSeconds)
    const id = window.setInterval(() => {
      setSeconds((prev) => (prev + 1 > resetAt ? 1 : prev + 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [startSeconds, resetAt])
  return seconds
}

