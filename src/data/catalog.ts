import { GAMES, getGame } from './games'
import { SERVERS } from './servers'
import type { GameServer } from './types'

export type SortKey = 'recommended' | 'online' | 'growth' | 'rating' | 'new' | 'launch'

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recommended', label: 'Рекомендуемые' },
  { key: 'online', label: 'Онлайн' },
  { key: 'growth', label: 'Рост' },
  { key: 'rating', label: 'Рейтинг' },
  { key: 'new', label: 'Новые' },
  { key: 'launch', label: 'Открытие' },
]

export interface CatalogFilters {
  query: string
  games: string[]
  versions: string[]
  modes: string[]
  regions: string[]
  languages: string[]
  minOnline: number
  minRating: number
  verifiedOnly: boolean
  openedWithin: 'any' | '30d' | '90d' | '365d'
  wipeSoon: boolean
  hideOffline: boolean
}

export const EMPTY_FILTERS: CatalogFilters = {
  query: '',
  games: [],
  versions: [],
  modes: [],
  regions: [],
  languages: [],
  minOnline: 0,
  minRating: 0,
  verifiedOnly: false,
  openedWithin: 'any',
  wipeSoon: false,
  hideOffline: false,
}

export function countActiveFilters(filters: CatalogFilters): number {
  let n = 0
  n += filters.games.length
  n += filters.versions.length
  n += filters.modes.length
  n += filters.regions.length
  n += filters.languages.length
  if (filters.minOnline > 0) n++
  if (filters.minRating > 0) n++
  if (filters.verifiedOnly) n++
  if (filters.openedWithin !== 'any') n++
  if (filters.wipeSoon) n++
  if (filters.hideOffline) n++
  return n
}

function matchesQuery(server: GameServer, query: string): boolean {
  if (!query.trim()) return true
  const haystack = [
    server.name,
    server.version,
    server.summary,
    getGame(server.gameId).name,
    getGame(server.gameId).shortName,
    ...server.modes,
    ...server.tags,
  ]
    .join(' ')
    .toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

const WINDOW_DAYS: Record<CatalogFilters['openedWithin'], number> = {
  any: Infinity,
  '30d': 30,
  '90d': 90,
  '365d': 365,
}

export function filterServers(filters: CatalogFilters, source: GameServer[] = SERVERS): GameServer[] {
  const now = Date.now()
  return source.filter((server) => {
    if (!matchesQuery(server, filters.query)) return false
    if (filters.games.length && !filters.games.includes(server.gameId)) return false
    if (filters.versions.length && !filters.versions.includes(server.version)) return false
    if (filters.modes.length && !server.modes.some((m) => filters.modes.includes(m))) return false
    if (filters.regions.length && !filters.regions.includes(server.region)) return false
    if (filters.languages.length && !server.languages.some((l) => filters.languages.includes(l))) return false
    if (filters.verifiedOnly && server.online.status !== 'verified') return false
    if (filters.hideOffline && server.online.status === 'offline') return false
    if (filters.minOnline > 0 && server.online.current < filters.minOnline) return false
    if (filters.minRating > 0 && server.rating < filters.minRating) return false
    if (filters.wipeSoon) {
      if (!server.nextWipeAt) return false
      const days = (new Date(server.nextWipeAt).getTime() - now) / 86_400_000
      if (days > 10) return false
    }
    const windowDays = WINDOW_DAYS[filters.openedWithin]
    if (windowDays !== Infinity) {
      const age = (now - new Date(server.openedAt).getTime()) / 86_400_000
      if (age > windowDays) return false
    }
    return true
  })
}

const STATUS_WEIGHT: Record<string, number> = {
  verified: 3,
  reported: 1.6,
  anomaly: 0.8,
  pending: 1.2,
  checking: 1,
  offline: 0.2,
}

export function sortServers(servers: GameServer[], sort: SortKey): GameServer[] {
  const list = [...servers]
  switch (sort) {
    case 'online':
      return list.sort((a, b) => b.online.current - a.online.current)
    case 'growth':
      return list.sort((a, b) => b.trendScore - a.trendScore)
    case 'rating':
      return list.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount)
    case 'new':
      return list.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    case 'launch':
      return list.sort((a, b) => {
        if (a.launch && !b.launch) return -1
        if (!a.launch && b.launch) return 1
        if (a.launch && b.launch) return new Date(a.launch.at).getTime() - new Date(b.launch.at).getTime()
        return b.online.current - a.online.current
      })
    default:
      return list.sort((a, b) => score(b) - score(a))
  }
}

function score(server: GameServer): number {
  const weight = STATUS_WEIGHT[server.online.status] ?? 1
  const online = Math.log10(server.online.current + 10) * 22
  const rating = server.rating * 9
  const reviews = Math.log10(server.reviewsCount + 10) * 6
  const growth = Math.max(-20, Math.min(60, server.trendScore)) * 0.35
  const promo = server.promo ? 4 : 0
  return (online + rating + reviews + growth + promo) * weight
}

export interface Suggestion {
  kind: 'game' | 'server' | 'mode'
  label: string
  sub: string
  to: string
  accent?: string
}

export function buildSuggestions(query: string, limit = 7): Suggestion[] {
  const q = query.trim().toLowerCase()
  const out: Suggestion[] = []

  const games = GAMES.filter((g) => !q || g.name.toLowerCase().includes(q) || g.shortName.toLowerCase().includes(q))
  for (const g of games.slice(0, q ? 3 : 2)) {
    out.push({
      kind: 'game',
      label: g.name,
      sub: `${g.serversCount.toLocaleString('ru-RU')} серверов`,
      to: `/catalog?game=${g.id}`,
      accent: g.accent,
    })
  }

  const servers = SERVERS.filter((s) => (q ? matchesQuery(s, q) : s.online.status === 'verified'))
    .sort((a, b) => b.online.current - a.online.current)
    .slice(0, q ? 4 : 3)
  for (const s of servers) {
    out.push({
      kind: 'server',
      label: s.name,
      sub: `${getGame(s.gameId).shortName} · ${s.version}`,
      to: `/server/${s.slug}`,
    })
  }

  if (q) {
    const modes = new Set<string>()
    for (const g of GAMES) for (const m of g.modes) if (m.toLowerCase().includes(q)) modes.add(m)
    for (const m of Array.from(modes).slice(0, 2)) {
      out.push({ kind: 'mode', label: m, sub: 'Режим игры', to: `/catalog?mode=${encodeURIComponent(m)}` })
    }
  }

  return out.slice(0, limit)
}

export const QUICK_SEARCHES = [
  { label: 'Minecraft Survival', to: '/catalog?game=minecraft&mode=Survival' },
  { label: 'GTA RP', to: '/catalog?game=gtarp' },
  { label: 'Lineage 2 High Five', to: '/catalog?game=lineage2&version=High+Five' },
  { label: 'Rust x2', to: '/catalog?game=rust' },
  { label: 'CS2 Retake', to: '/catalog?game=cs2&mode=Retake' },
]

export const ALL_VERSIONS = Array.from(new Set(SERVERS.map((s) => s.version)))
export const ALL_MODES = Array.from(new Set(SERVERS.flatMap((s) => s.modes))).sort((a, b) => a.localeCompare(b, 'ru'))
export const ALL_REGIONS = Array.from(new Set(SERVERS.map((s) => s.region)))
export const ALL_LANGUAGES = Array.from(new Set(SERVERS.flatMap((s) => s.languages)))
