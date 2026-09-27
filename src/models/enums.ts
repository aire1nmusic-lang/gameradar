/**
 * Domain enumerations.
 *
 * Values are the wire format: they travel to the API and the database
 * unchanged, so they are UPPER_SNAKE and must never be renamed casually.
 */

/**
 * How much GameScout trusts a server's player count.
 *
 * VERIFIED        — number obtained by GameScout itself (game protocol,
 *                   official API, or a signed GameScout Agent payload)
 * LIVE            — the server answers our probe, but the count it reports
 *                   cannot be independently confirmed (typical for Lineage 2,
 *                   where the login server exposes load, not players)
 * OWNER_REPORTED  — no probe at all; the number comes from the owner
 * OFFLINE         — the server does not answer
 * ANOMALY         — data looks manipulated and is held out of the rating
 * PENDING         — announced but not launched yet, nothing to measure
 * CHECKING        — a probe is in flight (transient UI state)
 */
export const OnlineStatus = {
  Verified: 'VERIFIED',
  Live: 'LIVE',
  OwnerReported: 'OWNER_REPORTED',
  Offline: 'OFFLINE',
  Anomaly: 'ANOMALY',
  Pending: 'PENDING',
  Checking: 'CHECKING',
  /** a third-party monitor reports the number — never VERIFIED */
  External: 'EXTERNAL',
  /** every source failed and none said the server is down */
  Unknown: 'UNKNOWN',
} as const
export type OnlineStatus = (typeof OnlineStatus)[keyof typeof OnlineStatus]

/** Statuses that count as "we measured this ourselves". */
export const TRUSTED_STATUSES: OnlineStatus[] = [OnlineStatus.Verified]

/** How the online number was obtained — shown to players verbatim. */
export const ProbeMethod = {
  GameProtocol: 'GAME_PROTOCOL',
  ServerApi: 'SERVER_API',
  Agent: 'AGENT',
  LoginServer: 'LOGIN_SERVER',
  OwnerSubmitted: 'OWNER_SUBMITTED',
  /** a counter the project publishes on its own site or API */
  OfficialSource: 'OFFICIAL_SOURCE',
  /** a third-party monitor (mcsrvstat.us, BattleMetrics, …) */
  ExternalMonitor: 'EXTERNAL_MONITOR',
  None: 'NONE',
} as const
export type ProbeMethod = (typeof ProbeMethod)[keyof typeof ProbeMethod]

/** Paid placement kinds. Never affects the organic rating. */
export const PromoKind = {
  Top: 'TOP',
  Vip: 'VIP',
  Featured: 'FEATURED',
} as const
export type PromoKind = (typeof PromoKind)[keyof typeof PromoKind]

/** Moderation state of a server card. */
export const ServerStatus = {
  Draft: 'DRAFT',
  Pending: 'PENDING_MODERATION',
  Published: 'PUBLISHED',
  Rejected: 'REJECTED',
  Archived: 'ARCHIVED',
} as const
export type ServerStatus = (typeof ServerStatus)[keyof typeof ServerStatus]

/** Ownership proof methods offered on /claim-server. */
export const ClaimMethod = {
  Dns: 'DNS_RECORD',
  File: 'SITE_FILE',
  Discord: 'DISCORD',
  Manual: 'MANUAL_REVIEW',
} as const
export type ClaimMethod = (typeof ClaimMethod)[keyof typeof ClaimMethod]

export const ClaimStatus = {
  Pending: 'PENDING',
  Verified: 'VERIFIED',
  Rejected: 'REJECTED',
} as const
export type ClaimStatus = (typeof ClaimStatus)[keyof typeof ClaimStatus]

/**
 * Lifecycle of a single vote.
 *
 * PENDING  — recorded by us, the server has not collected it yet
 * CLAIMED  — the server pulled it (or Votifier delivered it) and rewarded
 * REJECTED — failed anti-fraud
 */
export const VoteStatus = {
  Pending: 'PENDING',
  Claimed: 'CLAIMED',
  Rejected: 'REJECTED',
} as const
export type VoteStatus = (typeof VoteStatus)[keyof typeof VoteStatus]

/** How the reward callback reaches the game server. */
export const VoteDelivery = {
  /** server polls GET /api/v1/votes/pending — works for every game */
  Pull: 'PULL_API',
  /** Minecraft de-facto standard, TCP + RSA/HMAC */
  Votifier: 'VOTIFIER',
  /** signed HTTP POST to an endpoint the owner provides */
  Webhook: 'WEBHOOK',
} as const
export type VoteDelivery = (typeof VoteDelivery)[keyof typeof VoteDelivery]

export const UserRole = {
  Player: 'PLAYER',
  Owner: 'OWNER',
  Moderator: 'MODERATOR',
  Admin: 'ADMIN',
  Finance: 'FINANCE',
  Copyright: 'COPYRIGHT',
  Support: 'SUPPORT',
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const AuthProvider = {
  Discord: 'DISCORD',
  Google: 'GOOGLE',
  Steam: 'STEAM',
  Email: 'EMAIL',
} as const
export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider]

/** Advertising inventory. Every one of these is always labelled in the UI. */
export const AdSlot = {
  TopBanner: 'TOP_BANNER',
  Sidebar: 'SIDEBAR',
  Takeover: 'TAKEOVER',
  Featured: 'FEATURED',
  Inline: 'INLINE',
} as const
export type AdSlot = (typeof AdSlot)[keyof typeof AdSlot]

export type ChartRange = '24h' | '7d' | '30d'

export type GameMotif = 'cubes' | 'skyline' | 'spire' | 'barrel' | 'crosshair' | 'leaf' | 'signal' | 'rune'
