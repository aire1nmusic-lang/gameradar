export type OnlineStatus = 'verified' | 'reported' | 'offline' | 'anomaly' | 'pending' | 'checking'

export type PromoKind = 'top' | 'vip' | 'featured'

export type ChartRange = '24h' | '7d' | '30d'

export type GameMotif = 'cubes' | 'skyline' | 'spire' | 'barrel' | 'crosshair' | 'leaf' | 'signal' | 'rune'

export interface Game {
  id: string
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
  /** games we haven't launched coverage for yet */
  upcoming?: boolean
}

export interface OnlineData {
  status: OnlineStatus
  current: number
  max: number
  /** % change over the last 24 hours */
  change24h: number
  peak24h: number
  avg7d: number
  peak30d: number
  /** seconds since the last successful GameRadar probe */
  checkedAgoSec: number
  source: string
  method: string
  uptime24h: number
  checksPerDay: number
  note?: string
}

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

export interface GameServer {
  id: string
  slug: string
  name: string
  gameId: string
  version: string
  modes: string[]
  region: string
  country: string
  flag: string
  languages: string[]
  online: OnlineData
  rating: number
  reviewsCount: number
  openedAt: string
  lastWipeAt?: string
  nextWipeAt?: string
  updatedAt: string
  tags: string[]
  summary: string
  description: string
  rates?: string
  hue: number
  promo?: PromoKind
  launch?: LaunchInfo
  addedAt: string
  trendScore: number
  favorites: number
  links: { site: string; discord: string; telegram?: string }
  highlights: string[]
  history: Record<ChartRange, number[]>
  events: HistoryEvent[]
  reviews: Review[]
}
