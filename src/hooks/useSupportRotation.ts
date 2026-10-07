import { useEffect, useMemo, useState } from 'react'
import type { GameServer } from '@/models'
import { supportOrder } from '@/services/supportProjection'
import { shuffleZeroIds } from '@/services/zeroSupport'

/** Presentation only: positive Coins keep the canonical ranking. */
export function useSupportRotation(servers: GameServer[], enabled = true) {
  const zeroKey = JSON.stringify(servers.filter(s => (s.support?.coins ?? 0) === 0).map(s => s.id).sort())
  const [order, setOrder] = useState<string[]>(() => shuffleZeroIds(JSON.parse(zeroKey)))
  useEffect(() => {
    if (!enabled) return
    const ids: string[] = JSON.parse(zeroKey)
    const rotate = () => setOrder(previous => shuffleZeroIds(ids, previous))
    rotate()
    const timer = window.setInterval(rotate, 30000)
    return () => window.clearInterval(timer)
  }, [zeroKey, enabled])
  return useMemo(() => {
    if (!enabled) return [...servers].sort(supportOrder)
    const positions = new Map(order.map((id, i) => [id, i]))
    const paid = servers.filter(s => (s.support?.coins ?? 0) > 0).sort(supportOrder)
    const zero = servers.filter(s => (s.support?.coins ?? 0) === 0).sort((a,b) =>
      (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
    return [...paid, ...zero]
  }, [servers, order, enabled])
}
