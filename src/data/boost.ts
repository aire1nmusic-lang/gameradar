import { activeBoosts, organicScore } from '@/services/scoring'
import { chronicleOfVersion } from './games'
import { SERVERS } from './servers'
import type { GameServer } from '@/models'

/**
 * Boost economy.
 *
 * The rating is deliberately split in two:
 *   organicScore — earned by verified online, rating and reviews. Never for sale.
 *   boosts       — bought by the owner. Always shown separately and labelled.
 *
 * Both numbers are visible in the UI so a player can always tell why a server
 * sits where it sits.
 */

export interface BoostPackage {
  id: 'start' | 'pro' | 'max'
  name: string
  boosts: number
  price: number
  priceLabel: string
  perBoostLabel: string
  tagline: string
  features: string[]
  popular?: boolean
}

export const BOOST_PACKAGES: BoostPackage[] = [
  {
    id: 'start',
    name: 'START',
    boosts: 100,
    price: 990,
    priceLabel: '990 ₽',
    perBoostLabel: '9,9 ₽ за буст',
    tagline: 'Попробовать продвижение',
    features: ['100 бустов', 'Метка «Продвижение»', 'Статистика переходов'],
  },
  {
    id: 'pro',
    name: 'PRO',
    boosts: 500,
    price: 3_900,
    priceLabel: '3 900 ₽',
    perBoostLabel: '7,8 ₽ за буст',
    tagline: 'Попасть в TOP-10 своей игры',
    features: ['500 бустов', 'Выделенная карточка (VIP)', 'Приоритет в блоке «Открытия»', 'Статистика по источникам'],
    popular: true,
  },
  {
    id: 'max',
    name: 'MAX',
    boosts: 1000,
    price: 6_900,
    priceLabel: '6 900 ₽',
    perBoostLabel: '6,9 ₽ за буст',
    tagline: 'Бороться за TOP-1',
    features: [
      '1 000 бустов',
      'Featured на главной',
      'Баннер в мире игры',
      'Launch Promotion перед открытием',
      'Персональный менеджер',
    ],
  },
]

export { activeBoosts, organicScore }

export interface RankedServer {
  server: GameServer
  organic: number
  boosts: number
  total: number
  /** position in the combined (boost-aware) leaderboard */
  rank: number
  /** position in the independent, boost-free leaderboard */
  organicRank: number
  boosted: boolean
}

function scope(gameId?: string, chronicleId?: string): GameServer[] {
  let list = SERVERS.filter((server) => server.online.status !== 'PENDING')
  if (gameId) list = list.filter((server) => server.gameId === gameId)
  if (gameId && chronicleId) {
    list = list.filter((server) => chronicleOfVersion(gameId, server.version)?.id === chronicleId)
  }
  return list
}

/** Full leaderboard for a game / chronicle, with both rankings resolved. */
export function leaderboard(gameId?: string, chronicleId?: string): RankedServer[] {
  const list = scope(gameId, chronicleId)

  const organicRanking = [...list]
    .map((server) => ({ slug: server.slug, organic: organicScore(server) }))
    .sort((a, b) => b.organic - a.organic)
  const organicRankBySlug = new Map(organicRanking.map((entry, index) => [entry.slug, index + 1]))

  return list
    .map((server) => {
      const organic = organicScore(server)
      const boosts = activeBoosts(server)
      return {
        server,
        organic,
        boosts,
        total: organic + boosts,
        rank: 0,
        organicRank: organicRankBySlug.get(server.slug) ?? 0,
        boosted: boosts > 0,
      }
    })
    .sort((a, b) => b.total - a.total)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

/**
 * The independent rating: identical data, boosts excluded.
 * Servers flagged DATA ANOMALY are held out until GameScout re-verifies them,
 * so a suspicious number can never earn a position.
 */
export function organicLeaderboard(gameId?: string, chronicleId?: string): RankedServer[] {
  return leaderboard(gameId, chronicleId)
    .filter((entry) => entry.server.online.status !== 'ANOMALY')
    .sort((a, b) => b.organic - a.organic)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

export interface BoostForecast {
  currentRank: number
  currentTotal: number
  projectedRank: number
  projectedTotal: number
  /** boosts needed to take the position directly above */
  toNext: number
  /** additional boosts still required to reach the tier, 0 when already there */
  toTop10: number
  toTop3: number
  toTop1: number
  /** servers that would be overtaken */
  overtakes: number
}

const tierGap = (entries: RankedServer[], total: number, tier: number): number => {
  const others = entries.map((entry) => entry.total).sort((a, b) => b - a)
  // the score currently holding the tier position, ignoring our own entry
  const threshold = others[tier - 1]
  if (threshold === undefined || total > threshold) return 0
  return Math.ceil(threshold - total + 1)
}

/** What happens to a server's position if the owner buys `extraBoosts`. */
export function boostForecast(slug: string, extraBoosts: number, gameId?: string): BoostForecast {
  const entries = leaderboard(gameId)
  const me = entries.find((entry) => entry.server.slug === slug)
  if (!me) {
    return {
      currentRank: 0,
      currentTotal: 0,
      projectedRank: 0,
      projectedTotal: 0,
      toNext: 0,
      toTop10: 0,
      toTop3: 0,
      toTop1: 0,
      overtakes: 0,
    }
  }

  const projectedTotal = me.total + extraBoosts
  const others = entries.filter((entry) => entry.server.slug !== slug)
  const projectedRank = others.filter((entry) => entry.total > projectedTotal).length + 1
  const overtakes = others.filter((entry) => entry.total > me.total && entry.total <= projectedTotal).length

  const pool = others.map((entry) => ({ ...entry }))
  return {
    currentRank: me.rank,
    currentTotal: me.total,
    projectedRank,
    projectedTotal,
    toNext: tierGap(pool, me.total, Math.max(1, me.rank - 1)),
    toTop10: tierGap(pool, me.total, 10),
    toTop3: tierGap(pool, me.total, 3),
    toTop1: tierGap(pool, me.total, 1),
    overtakes,
  }
}

/** Tier label for a rank — TOP 1 / TOP 3 / TOP 10 / null. */
export function tierOf(rank: number): 'top1' | 'top3' | 'top10' | null {
  if (rank === 1) return 'top1'
  if (rank <= 3) return 'top3'
  if (rank <= 10) return 'top10'
  return null
}

export const TIER_LABEL: Record<'top1' | 'top3' | 'top10', string> = {
  top1: 'TOP 1',
  top3: 'TOP 3',
  top10: 'TOP 10',
}

/** Demo state for the owner's own server on /boost. */
export const MY_SERVER_SLUG = 'holysky'
