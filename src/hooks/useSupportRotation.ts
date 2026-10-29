import type { GameServer } from '@/models'
import { useRankingRotation } from './useRankingRotation'
/** Compatibility wrapper: every list/profile now shares the same 30-second clock. */
export function useSupportRotation(servers: GameServer[], enabled = true) {
  return useRankingRotation(servers, 'support', enabled)
}
