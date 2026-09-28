/**
 * GameScout domain model.
 *
 * Pure types and enums — no React, no data access, no formatting. Everything
 * here describes what the platform *is*, independent of where the data is
 * stored today (mock fixtures) or tomorrow (Postgres / D1 behind Workers).
 */

export * from './enums'

import type {
  AdSlot,
  ChartRange,
  ClaimMethod,
  ClaimStatus,
  GameMotif,
  OnlineStatus,
  ProbeMethod,
  PromoKind,
  ServerStatus,
  UserRole,
  AuthProvider,
  VoteDelivery,
  VoteStatus,
} from './enums'

/* ── Game & chronicle ───────────────────────────────────────────────────── */

/**
 * A chronicle is a sub-world of a game: an L2 chronicle, a GTA RP platform,
 * a Minecraft mode. It filters servers and may carry its own theme and art.
 */
export interface Chronicle {
  id: string
  /** url segment under the game: /lineage-2/interlude */
  slug: string
  label: string
  tagline: string
  /** key in CHRONICLE_THEMES; when absent the game theme is used as-is */
  themeId?: string
  /** Server.version values that belong to this chronicle */
  versions: string[]
  serversCount: number
  playersOnline: number
}

export interface Game {
  id: string
  /** url segment of the game world: /minecraft, /lineage-2 */
  slug: string
  name: string
  shortName: string
  tagline: string
  motif: GameMotif
  from: string
  to: string
  accent: string
  serversCount: number
  playersOnline: number
  versions: string[]
  modes: string[]
  /** sub-worlds; empty when the game has no meaningful split */
  chronicles: Chronicle[]
  /** listed for SEO but not part of the launch scope */
  upcoming?: boolean
}

/* ── Online & monitoring ────────────────────────────────────────────────── */

export interface OnlineData {
  /** false when the probe answered without a count — never print 0 then */
  playersKnown?: boolean
  maxKnown?: boolean
  /** DIRECT — our probe; OFFICIAL — the project's own counter; EXTERNAL — a third-party monitor */
  sourceTier?: 'DIRECT' | 'OFFICIAL' | 'EXTERNAL'
  /** public page where the number can be checked */
  sourceUrl?: string
  /** stale numbers are history, never shown as current */
  freshness?: 'fresh' | 'stale' | 'unknown'
  /** seconds since the number was true according to its source */
  observedAgoSec?: number
  status: OnlineStatus
  current: number
  max: number
  /** % change over the last 24 hours */
  change24h: number
  peak24h: number
  avg7d: number
  peak30d: number
  /** seconds since the last successful probe */
  checkedAgoSec: number
  /** human label of the source, e.g. "GameScout Direct Query" */
  source: string
  method: ProbeMethod
  uptime24h: number
  checksPerDay: number
  note?: string
}

/** One stored measurement. The monitoring worker appends these. */
export interface OnlineSample {
  serverId: string
  /** When the measurement was true according to its source. */
  at: string
  players: number | null
  status: OnlineStatus
  latencyMs?: number
  sourceTier?: 'DIRECT' | 'OFFICIAL' | 'EXTERNAL'
  sourceName?: string
  /** When GameScout retrieved this measurement; may differ for cached sources. */
  fetchedAt?: string
}

/** Connection details the monitor needs. Not shown to players in full. */
export interface MonitoringTarget {
  host?: string
  port?: number
  /** FiveM / custom endpoint returning player data */
  apiUrl?: string
  /** set when the owner installed the GameScout Agent */
  agentToken?: string
  method: ProbeMethod
}

/* ── Server ─────────────────────────────────────────────────────────────── */

export interface LaunchInfo {
  at: string
  type: string
  preRegistrations: number
  interestChange: number
  promoted?: boolean
}

export interface Review {
  id: string
  author: string
  hue: number
  rating: number
  date: string
  playtime: string
  text: string
  helpful: number
  verifiedPlayer: boolean
}

export interface HistoryEvent {
  label: string
  date: string
  kind: 'wipe' | 'update' | 'open' | 'season' | 'verify'
}

export interface ServerLinks {
  site: string
  discord: string
  telegram?: string
}

export interface GameServer {
  id: string
  slug: string
  name: string

  gameId: string
  /** raw version/chronicle label as the owner states it: "High Five", "1.21" */
  version: string
  /** resolved chronicle id, when the version maps to one */
  chronicleId?: string
  modes: string[]

  summary: string
  description: string
  /** A scoped copyright restriction hides the description text while retaining the card. */
  descriptionRestricted?: boolean
  highlights: string[]
  tags: string[]
  rates?: string

  /** brand colour seed until a real logo is uploaded */
  hue: number
  logoUrl?: string
  bannerUrl?: string
  screenshots?: string[]

  links: ServerLinks
  /** join address for the game client (Minecraft / Rust / CS2); absent when only a website is known */
  address?: string

  region: string
  country: string
  flag: string
  languages: string[]

  online: OnlineData
  /** Public, eventually consistent Support aggregate; never part of People's rating. */
  support?: { coins: number; participants: number }
  history: Record<ChartRange, number[]>

  rating: number
  reviewsCount: number
  votes: number
  favorites: number
  trendScore: number

  promo?: PromoKind
  launch?: LaunchInfo

  ownerId?: string
  moderation: ServerStatus

  /** absent when the opening date is not known — never guessed */
  openedAt?: string
  addedAt: string
  updatedAt: string
  lastWipeAt?: string
  nextWipeAt?: string

  events: HistoryEvent[]
  reviews: Review[]

  /** fixtures only — never rendered as a real capture */
  demo?: boolean
  /** where an imported card's facts come from; absent for owner-submitted cards */
  provenance?: ServerProvenance
}

export interface ServerProvenance {
  sourceName?: string
  sourceUrl?: string
  importedAt?: string
  lastSourceCheckAt?: string
  refs: { name: string; url: string }[]
}

/* ── People ─────────────────────────────────────────────────────────────── */

export interface User {
  id: string
  email?: string
  emailVerified?: boolean
  displayName: string
  avatarUrl?: string
  provider: AuthProvider
  roles: UserRole[]
  permissions?: string[]
  createdAt: string
}

export interface Owner {
  id: string
  userId: string
  contactEmail?: string
  discord?: string
  serverIds: string[]
  createdAt: string
}

/** A pending or completed "this is my server" proof. */
export interface ServerClaim {
  verificationUrl?: string
  id: string
  serverId: string
  userId: string
  method: ClaimMethod
  status: ClaimStatus
  /** token the owner must publish (DNS TXT value, file contents, …) */
  proofToken: string
  createdAt: string
  resolvedAt?: string
}

/* ── Votes ──────────────────────────────────────────────────────────────── */

export interface Vote {
  id: string
  serverId: string
  /** in-game nickname the reward is issued to */
  nickname: string
  userId?: string
  status: VoteStatus
  delivery: VoteDelivery
  createdAt: string
  claimedAt?: string
  /** hashed, never stored raw */
  ipHash?: string
}

/** Per-server vote integration settings, owned by the server owner. */
export interface VoteIntegration {
  rewardTitle?: string
  hasApiKey?: boolean
  serverId: string
  delivery: VoteDelivery
  /** Bearer token for the pull API */
  apiKey?: string
  /** NuVotifier v2 endpoint (Minecraft only); the token itself is never sent back */
  votifierHost?: string
  votifierPort?: number
  hasVotifierToken?: boolean
  cooldownHours: number
  rewardDescription?: string
}

/* ── Rating & boost ─────────────────────────────────────────────────────── */

/** A server's position, with earned and bought points kept apart. */
export interface RankedServer {
  server: GameServer
  /** earned by data: online, votes, rating, stability. Never for sale. */
  organic: number
  /** bought by the owner. Shown separately, always. */
  boosts: number
  total: number
  /** position in the sponsored-aware list */
  rank: number
  /** position in the independent list */
  organicRank: number
  boosted: boolean
}

export interface BoostPackage {
  id: string
  name: string
  boosts: number
  price: number
  priceLabel: string
  perBoostLabel: string
  tagline: string
  features: string[]
  popular?: boolean
}

export interface BoostOrder {
  id: string
  serverId: string
  ownerId: string
  packageId: string
  boosts: number
  price: number
  createdAt: string
  expiresAt?: string
}

/* ── Advertising ────────────────────────────────────────────────────────── */

export interface Advertisement {
  id: string
  slot: AdSlot
  /** null = runs across the whole platform */
  gameId?: string
  advertiser: string
  headline: string
  sub: string
  cta: string
  href: string
  /** promoted server, when the creative is a server placement */
  serverId?: string
  activeFrom?: string
  activeTo?: string
}

/** One headline number on the owner dashboard. */
export interface OwnerMetric {
  key: string
  label: string
  value: number
  change: number
  format: 'number' | 'percent'
  hint: string
}

/** Card analytics for one owned server. */
export interface OwnerProject {
  server: GameServer
  metrics: OwnerMetric[]
  views: number[]
  clicks: number[]
  rankPosition: number
  rankTotal: number
  rankChange: number
  sources: Array<{ label: string; value: number }>
  countries: Array<{ label: string; flag: string; value: number }>
}

/** A notice shown in the owner dashboard. */
export interface OwnerAlert {
  id: string
  kind: 'ok' | 'info' | 'warn'
  title: string
  body: string
  at: string
}

/** A promotion package an owner can buy. Configuration, not catalogue data. */
export interface PromoProduct {
  id: string
  name: string
  tag: string
  description: string
  bullets: string[]
  priceLabel: string
  accent: 'TOP' | 'VIP' | 'FEATURED' | 'banner' | 'launch'
}

export interface AdProduct {
  id: string
  name: string
  slot: AdSlot
  place: string
  size: string
  description: string
  priceLabel: string
}

/* ── Query shapes shared by repositories and services ───────────────────── */

export type SortKey = 'recommended' | 'online' | 'growth' | 'rating' | 'new' | 'launch' | 'votes' | 'support'

export interface ServerQuery {
  query?: string
  gameId?: string
  gameIds?: string[]
  chronicleId?: string
  versions?: string[]
  modes?: string[]
  regions?: string[]
  languages?: string[]
  minOnline?: number
  minRating?: number
  verifiedOnly?: boolean
  hideOffline?: boolean
  openedWithin?: 'any' | '30d' | '90d' | '365d'
  wipeSoon?: boolean
  onlyLaunching?: boolean
  sort?: SortKey
  limit?: number
  offset?: number
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
