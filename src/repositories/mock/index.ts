import { hashSeed, rng } from '@/lib/utils'
import {
  ClaimStatus,
  OnlineStatus,
  ServerStatus,
  VoteDelivery,
  VoteStatus,
  AuthProvider,
  UserRole,
  type AdSlot,
  type Advertisement,
  type GameServer,
  type Page,
  type ServerQuery,
} from '@/models'
import { GAMES, chronicleOfVersion } from '@/data/games'
import { SERVERS, SERVERS_BY_SLUG, similarServers } from '@/data/servers'
import { BOOST_PACKAGES, activeBoosts, boostForecast, leaderboard, organicLeaderboard } from '@/data/boost'
import { AD_INVENTORY, AD_PRODUCTS, type AdCreative } from '@/data/ads'
import { OWNER_PROJECTS } from '@/data/dashboard'
import { PLATFORM_STATS } from '@/data/servers'
import type {
  AdRepository,
  BoostRepository,
  GameRepository,
  OwnerRepository,
  RatingRepository,
  Repositories,
  ServerRepository,
  UserRepository,
  VoteRepository,
} from '../types'

/**
 * In-memory implementation backed by the demo fixtures in `src/data`.
 *
 * This is the "database" of the prototype. It deliberately behaves like a
 * network: every call is async and pays a small latency, so the UI is written
 * against real loading states from day one instead of being retrofitted later.
 */

/** Latency in ms. Set to 0 in tests. */
let latency = 90
export function setMockLatency(ms: number) {
  latency = ms
}

function reply<T>(value: T): Promise<T> {
  if (latency <= 0) return Promise.resolve(value)
  return new Promise((resolve) => setTimeout(() => resolve(value), latency))
}

/* ── games ──────────────────────────────────────────────────────────────── */

const games: GameRepository = {
  list: () => reply(GAMES),
  byId: (id) => reply(GAMES.find((game) => game.id === id)),
  bySlug: (slug) => reply(GAMES.find((game) => game.slug === slug)),
  chronicles: (gameId) => reply(GAMES.find((game) => game.id === gameId)?.chronicles ?? []),
}

/* ── servers ────────────────────────────────────────────────────────────── */

const WINDOW_DAYS: Record<NonNullable<ServerQuery['openedWithin']>, number> = {
  any: Infinity,
  '30d': 30,
  '90d': 90,
  '365d': 365,
}

function matchesText(server: GameServer, text: string): boolean {
  const game = GAMES.find((item) => item.id === server.gameId)
  const haystack = [
    server.name,
    server.version,
    server.summary,
    game?.name ?? '',
    game?.shortName ?? '',
    ...server.modes,
    ...server.tags,
  ]
    .join(' ')
    .toLowerCase()
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

const STATUS_WEIGHT: Record<string, number> = {
  [OnlineStatus.Verified]: 3,
  [OnlineStatus.Live]: 2.2,
  [OnlineStatus.OwnerReported]: 1.6,
  [OnlineStatus.Anomaly]: 0.8,
  [OnlineStatus.Pending]: 1.2,
  [OnlineStatus.Checking]: 1,
  [OnlineStatus.Offline]: 0.2,
}

function recommendedScore(server: GameServer): number {
  const weight = STATUS_WEIGHT[server.online.status] ?? 1
  const online = Math.log10(server.online.current + 10) * 22
  const rating = server.rating * 9
  const reviews = Math.log10(server.reviewsCount + 10) * 6
  const growth = Math.max(-20, Math.min(60, server.trendScore)) * 0.35
  const promo = server.promo ? 4 : 0
  return (online + rating + reviews + growth + promo) * weight
}

function applyQuery(query: ServerQuery): GameServer[] {
  const now = Date.now()

  let list = SERVERS.filter((server) => {
    if (server.moderation !== ServerStatus.Published) return false
    if (query.query && !matchesText(server, query.query)) return false
    if (query.gameId && server.gameId !== query.gameId) return false
    if (query.gameIds?.length && !query.gameIds.includes(server.gameId)) return false
    if (query.chronicleId) {
      if (chronicleOfVersion(server.gameId, server.version)?.id !== query.chronicleId) return false
    }
    if (query.versions?.length && !query.versions.includes(server.version)) return false
    if (query.modes?.length && !server.modes.some((mode) => query.modes!.includes(mode))) return false
    if (query.regions?.length && !query.regions.includes(server.region)) return false
    if (query.languages?.length && !server.languages.some((lang) => query.languages!.includes(lang))) return false
    if (query.verifiedOnly && server.online.status !== OnlineStatus.Verified) return false
    if (query.hideOffline && server.online.status === OnlineStatus.Offline) return false
    if (query.onlyLaunching && !server.launch) return false
    if (query.minOnline && server.online.current < query.minOnline) return false
    if (query.minRating && server.rating < query.minRating) return false
    if (query.wipeSoon) {
      if (!server.nextWipeAt) return false
      if ((new Date(server.nextWipeAt).getTime() - now) / 86_400_000 > 10) return false
    }
    const windowDays = WINDOW_DAYS[query.openedWithin ?? 'any']
    if (windowDays !== Infinity) {
      if ((now - new Date(server.openedAt).getTime()) / 86_400_000 > windowDays) return false
    }
    return true
  })

  switch (query.sort) {
    case 'online':
      list = list.sort((a, b) => b.online.current - a.online.current)
      break
    case 'growth':
      list = list.sort((a, b) => b.trendScore - a.trendScore)
      break
    case 'rating':
      list = list.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount)
      break
    case 'votes':
      list = list.sort((a, b) => b.votes - a.votes)
      break
    case 'new':
      list = list.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
      break
    case 'launch':
      list = list.sort((a, b) => {
        if (a.launch && !b.launch) return -1
        if (!a.launch && b.launch) return 1
        if (a.launch && b.launch) return new Date(a.launch.at).getTime() - new Date(b.launch.at).getTime()
        return b.online.current - a.online.current
      })
      break
    default:
      list = list.sort((a, b) => recommendedScore(b) - recommendedScore(a))
  }

  return list
}

const servers: ServerRepository = {
  query: (query) => {
    const all = applyQuery(query)
    const offset = query.offset ?? 0
    const limit = query.limit ?? all.length
    const page: Page<GameServer> = {
      items: all.slice(offset, offset + limit),
      total: all.length,
      limit,
      offset,
    }
    return reply(page)
  },
  byId: (id) => reply(SERVERS.find((server) => server.id === id)),
  bySlug: (slug) => reply(SERVERS_BY_SLUG[slug]),
  similar: (slug, limit = 3) => {
    const server = SERVERS_BY_SLUG[slug]
    return reply(server ? similarServers(server, limit) : [])
  },
  facets: (gameId) => {
    const pool = gameId ? SERVERS.filter((server) => server.gameId === gameId) : SERVERS
    return reply({
      versions: Array.from(new Set(pool.map((server) => server.version))),
      modes: Array.from(new Set(pool.flatMap((server) => server.modes))).sort((a, b) => a.localeCompare(b, 'ru')),
      regions: Array.from(new Set(pool.map((server) => server.region))),
      languages: Array.from(new Set(pool.flatMap((server) => server.languages))),
    })
  },
  platformStats: () => reply(PLATFORM_STATS),
  submit: (input) => {
    // The prototype does not persist. A real implementation inserts a row with
    // moderation = PENDING_MODERATION and returns it.
    const draft = {
      ...(input as GameServer),
      id: input.slug ?? `draft-${Date.now()}`,
      moderation: ServerStatus.Pending,
    }
    return reply(draft)
  },
}

/* ── rating ─────────────────────────────────────────────────────────────── */

const rating: RatingRepository = {
  leaderboard: (gameId, chronicleId) => reply(leaderboard(gameId, chronicleId)),
  organic: (gameId, chronicleId) => reply(organicLeaderboard(gameId, chronicleId)),
  positionOf: (slug, gameId) => reply(leaderboard(gameId).find((entry) => entry.server.slug === slug)),
}

/* ── votes ──────────────────────────────────────────────────────────────── */

const COOLDOWN_HOURS = 12

/** Demo vote log. Resets on reload — persistence arrives with the backend. */
const voteLog: Array<{ serverId: string; voterKey: string; at: number }> = []

const votes: VoteRepository = {
  cast: ({ serverId, nickname, userId }) => {
    const at = Date.now()
    voteLog.push({ serverId, voterKey: userId ?? nickname.toLowerCase(), at })
    return reply({
      id: `vote-${at}`,
      serverId,
      nickname,
      userId,
      status: VoteStatus.Pending,
      delivery: VoteDelivery.Pull,
      createdAt: new Date(at).toISOString(),
    })
  },
  eligibility: (serverId, voterKey) => {
    const last = voteLog
      .filter((entry) => entry.serverId === serverId && entry.voterKey === voterKey)
      .sort((a, b) => b.at - a.at)[0]
    if (!last) return reply({ allowed: true })
    const next = last.at + COOLDOWN_HOURS * 3_600_000
    return reply(
      next <= Date.now() ? { allowed: true } : { allowed: false, nextAllowedAt: new Date(next).toISOString() },
    )
  },
  recent: (serverId, limit = 10) => {
    const server = SERVERS.find((item) => item.id === serverId)
    if (!server) return reply([])
    const random = rng(hashSeed(`${serverId}-votes`))
    const items = Array.from({ length: limit }, (_, index) => ({
      id: `${serverId}-v${index}`,
      serverId,
      nickname: `player${Math.floor(random() * 9000 + 1000)}`,
      status: VoteStatus.Claimed,
      delivery: VoteDelivery.Pull,
      createdAt: new Date(Date.now() - index * 1_800_000).toISOString(),
    }))
    return reply(items)
  },
  countFor: (serverId) => reply(SERVERS.find((item) => item.id === serverId)?.votes ?? 0),
  integration: (serverId) =>
    reply({
      serverId,
      delivery: VoteDelivery.Pull,
      apiKey: `grk_${hashSeed(serverId).toString(16)}`,
      cooldownHours: COOLDOWN_HOURS,
    }),
}

/* ── boosts ─────────────────────────────────────────────────────────────── */

const boosts: BoostRepository = {
  packages: () => reply(BOOST_PACKAGES),
  activeFor: (serverId) => {
    const server = SERVERS.find((item) => item.id === serverId)
    return reply(server ? activeBoosts(server) : 0)
  },
  forecast: (slug, extraBoosts, gameId) => reply(boostForecast(slug, extraBoosts, gameId)),
  createOrder: ({ serverId, packageId, ownerId }) => {
    const pack = BOOST_PACKAGES.find((item) => item.id === packageId)
    return reply({
      id: `order-${Date.now()}`,
      serverId,
      ownerId,
      packageId,
      boosts: pack?.boosts ?? 0,
      price: pack?.price ?? 0,
      createdAt: new Date().toISOString(),
    })
  },
}

/* ── ads ────────────────────────────────────────────────────────────────── */

/** Legacy fixture slot ids → model enum. */
const SLOT_MAP: Record<string, AdSlot> = {
  'top-banner': 'TOP_BANNER',
  sidebar: 'SIDEBAR',
  takeover: 'TAKEOVER',
  featured: 'FEATURED',
  inline: 'INLINE',
}

function toAdvertisement(creative: AdCreative): Advertisement {
  return {
    id: creative.id,
    slot: SLOT_MAP[creative.slot] ?? 'INLINE',
    gameId: creative.gameId,
    advertiser: creative.advertiser,
    headline: creative.headline,
    sub: creative.sub,
    cta: creative.cta,
    href: creative.href,
    serverId: creative.serverSlug,
  }
}

const ads: AdRepository = {
  forSlot: (slot, gameId) => {
    const legacy = Object.entries(SLOT_MAP).find(([, value]) => value === slot)?.[0]
    const pool = AD_INVENTORY.filter((creative) => creative.slot === legacy)
    const creative = pool.find((item) => item.gameId === gameId) ?? pool.find((item) => !item.gameId)
    return reply(creative ? toAdvertisement(creative) : undefined)
  },
  products: () => reply(AD_PRODUCTS.map((product) => ({ ...product, slot: SLOT_MAP[product.id] ?? 'INLINE' }))),
}

/* ── people ─────────────────────────────────────────────────────────────── */

const DEMO_USER = {
  id: 'user-demo',
  displayName: 'Demo Owner',
  provider: AuthProvider.Discord,
  roles: [UserRole.Player, UserRole.Owner],
  createdAt: new Date(Date.now() - 400 * 86_400_000).toISOString(),
}

const owners: OwnerRepository = {
  current: () =>
    reply({
      id: 'owner-demo',
      userId: DEMO_USER.id,
      serverIds: ['holysky', 'frostpeak'],
      createdAt: DEMO_USER.createdAt,
    }),
  serversOf: (_ownerId) => reply(SERVERS.filter((server) => ['holysky', 'frostpeak'].includes(server.slug))),
  analytics: (_ownerId) => reply(OWNER_PROJECTS),
  claim: ({ serverId, userId, method }) =>
    reply({
      id: `claim-${Date.now()}`,
      serverId,
      userId,
      method,
      status: ClaimStatus.Pending,
      proofToken: `gameradar-verify=${hashSeed(serverId).toString(16)}`,
      createdAt: new Date().toISOString(),
    }),
  claims: () => reply([]),
}

const users: UserRepository = {
  current: () => reply(undefined), // no auth in the prototype
}

export const mockRepositories: Repositories = {
  games,
  servers,
  rating,
  votes,
  boosts,
  ads,
  owners,
  users,
}
