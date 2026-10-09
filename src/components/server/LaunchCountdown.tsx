import { useSyncExternalStore } from 'react'
import { formatLaunch, formatLiveCountdown } from '@/lib/format'

const listeners = new Set<() => void>()
let now = Date.now()
let interval: ReturnType<typeof setInterval> | undefined
const tick = () => { now = Date.now(); listeners.forEach(listener => listener()) }
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (listeners.size === 1) {
    now = Date.now()
    interval = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(interval)
      interval = undefined
      document.removeEventListener('visibilitychange', tick)
    }
  }
}

/** One clock for all visible openings; elapsed wall time also covers sleeping tabs. */
export function LaunchCountdown({ at }: { at: string }) {
  const clock = useSyncExternalStore(subscribe, () => now, () => now)
  return <time className="gs-launch-countdown" role="timer" aria-live="off" dateTime={at} title={formatLaunch(at)}>{formatLiveCountdown(at, clock)}</time>
}
