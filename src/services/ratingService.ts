import { repo } from '@/repositories'
import type { RankedServer } from '@/models'

/**
 * Rating rules.
 *
 * Two lists, never merged: the independent one (earned points only) and the
 * sponsored-aware one. Boosts can move a card in the second list and in the
 * ad slots — never in the first.
 */

export function organicRating(gameId?: string, chronicleId?: string) {
  return repo.rating.organic(gameId, chronicleId)
}

export function sponsoredRating(gameId?: string, chronicleId?: string) {
  return repo.rating.leaderboard(gameId, chronicleId)
}

export function positionOf(slug: string, gameId?: string) {
  return repo.rating.positionOf(slug, gameId)
}

export type Tier = 'top1' | 'top3' | 'top10'

export function tierOf(rank: number): Tier | null {
  if (rank === 1) return 'top1'
  if (rank <= 3) return 'top3'
  if (rank <= 10) return 'top10'
  return null
}

export const TIER_LABEL: Record<Tier, string> = {
  top1: 'TOP 1',
  top3: 'TOP 3',
  top10: 'TOP 10',
}

/** Share of a card's points that was bought rather than earned. */
export function paidShare(entry: RankedServer): number {
  const total = entry.organic + entry.boosts
  return total === 0 ? 0 : entry.boosts / total
}

/** Paid cards inside a top slice — the number we disclose to players. */
export function paidCountIn(entries: RankedServer[], size: number): number {
  return entries.slice(0, size).filter((entry) => entry.boosted).length
}
