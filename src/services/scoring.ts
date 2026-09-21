import { hashSeed, rng } from '@/lib/utils'
import { OnlineStatus, PromoKind, type GameServer } from '@/models'
import { TRUST_WEIGHT } from './monitoringService'

/**
 * Scoring rules — the arithmetic behind every position on the platform.
 *
 * Two numbers, always kept apart:
 *   organicScore — what a server earned with its own data
 *   activeBoosts — what its owner paid for
 *
 * They are summed only in the sponsored view, and the UI always shows the
 * split so a player can see which part of a position was bought.
 */

/** Points a server earns on its own. Never affected by payments. */
export function organicScore(server: GameServer): number {
  const online = server.online.current * 0.6
  const rating = server.rating * 80
  const reviews = Math.log10(server.reviewsCount + 10) * 120
  const votes = Math.log10(server.votes + 10) * 90
  const trust = 150 * (TRUST_WEIGHT[server.online.status] ?? 0)
  const growth = Math.max(-40, Math.min(80, server.trendScore)) * 1.5
  return Math.round(online + rating + reviews + votes + trust + growth)
}

/**
 * Boosts currently paid for by the owner.
 *
 * Deterministic demo values — a real implementation reads the active
 * BoostOrder rows for the server.
 */
export function activeBoosts(server: GameServer): number {
  const random = rng(hashSeed(`${server.slug}-boost`))
  if (server.promo === PromoKind.Top) return 800 + Math.round(random() * 400)
  if (server.promo === PromoKind.Featured) return 500 + Math.round(random() * 200)
  if (server.promo === PromoKind.Vip) return 300 + Math.round(random() * 150)
  // a handful of servers run small campaigns
  return random() > 0.72 ? 40 + Math.round(random() * 180) : 0
}

/** Servers held out of the independent rating until re-verified. */
export function isRatingEligible(server: GameServer): boolean {
  return server.online.status !== OnlineStatus.Anomaly && server.online.status !== OnlineStatus.Pending
}
