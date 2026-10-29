import { useMemo, useSyncExternalStore } from 'react'
import type { GameServer } from '@/models'
import { presentationOrder, rankingPeriod, ROTATION_MS, type RankingBoard } from '@/services/rankingPresentation'

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined
function tick() {
  for (const listener of listeners) listener()
  if (timer !== undefined) clearTimeout(timer)
  if (listeners.size) timer = setTimeout(tick, ROTATION_MS - Date.now() % ROTATION_MS + 1)
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    tick()
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('pageshow', tick)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearTimeout(timer); timer = undefined
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('pageshow', tick)
    }
  }
}
export function useRankingPeriod() { return useSyncExternalStore(subscribe, rankingPeriod, () => 0) }
export function useRankingRotation(servers: GameServer[], board: RankingBoard, enabled = true) {
  const period = useRankingPeriod()
  return useMemo(() => presentationOrder(servers, board, period, enabled), [servers, board, period, enabled])
}
