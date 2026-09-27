import { repo } from '@/repositories'
import type { GameServer, Page, ServerQuery, SortKey } from '@/models'
import { apiRequest } from '@/repositories/http/client'
import type { CatalogFilters } from './filterState'

/**
 * Catalogue use-cases: searching, filtering and the discovery rails.
 *
 * Components call this, never a repository and never a fixture.
 */

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recommended', label: 'Рекомендуемые' },
  { key: 'online', label: 'По онлайну' },
  { key: 'growth', label: 'По росту' },
  { key: 'votes', label: 'По голосам' },
  { key: 'support', label: 'Поддержка' },
  { key: 'rating', label: 'По рейтингу' },
  { key: 'new', label: 'Новые' },
  { key: 'launch', label: 'Скоро открытие' },
]

/**
 * Maps the UI filter state onto a repository query.
 *
 * Keeping this in one place means the filter panel never has to know what the
 * API expects, and the API can evolve without touching the panel.
 */
export function toServerQuery(filters: CatalogFilters, sort: SortKey, limit?: number): ServerQuery {
  return {
    query: filters.query.trim() || undefined,
    gameIds: filters.games.length ? filters.games : undefined,
    versions: filters.versions.length ? filters.versions : undefined,
    modes: filters.modes.length ? filters.modes : undefined,
    regions: filters.regions.length ? filters.regions : undefined,
    languages: filters.languages.length ? filters.languages : undefined,
    minOnline: filters.minOnline || undefined,
    minRating: filters.minRating || undefined,
    verifiedOnly: filters.verifiedOnly || undefined,
    hideOffline: filters.hideOffline || undefined,
    openedWithin: filters.openedWithin !== 'any' ? filters.openedWithin : undefined,
    wipeSoon: filters.wipeSoon || undefined,
    sort,
    limit,
  }
}

export function searchServers(query: ServerQuery): Promise<Page<GameServer>> {
  return repo.servers.query(query)
}

/** Read-only join at the UI boundary: private vote counts order public cards. */
async function privateAggregateSort(query: ServerQuery, path: string, field: 'votes' | 'coins'): Promise<Page<GameServer>> {
  const ranking = async () => {
    const rows: Array<{server_id:string;votes?:number;coins?:number}> = []
    for (let offset=0; ; offset+=100) {
      const page=await apiRequest<Array<{server_id:string;votes?:number;coins?:number}>>(`${path}?limit=100&offset=${offset}`)
      rows.push(...page)
      if (page.length<100) return rows
    }
  }
  const [catalog, votes]=await Promise.all([
    repo.servers.query({...query,sort:'recommended',offset:0,limit:Number.MAX_SAFE_INTEGER}),ranking(),
  ])
  const score=new Map(votes.map(row=>[row.server_id,row[field]??0]))
  const sorted=[...catalog.items].sort((a,b)=>(score.get(b.id)??0)-(score.get(a.id)??0) || a.name.localeCompare(b.name,'ru') || a.id.localeCompare(b.id))
  const offset=query.offset??0,limit=query.limit??24
  return {items:sorted.slice(offset,offset+limit),total:sorted.length,offset,limit}
}
export const peopleSortedServers = (query: ServerQuery) => privateAggregateSort(query,'/people-rating','votes')
export const supportSortedServers = (query: ServerQuery) => privateAggregateSort(query,'/support/ranking','coins')

export async function listServers(query: ServerQuery): Promise<GameServer[]> {
  const page = await repo.servers.query(query)
  return page.items
}

export function facetsFor(gameId?: string) {
  return repo.servers.facets(gameId)
}

/** Headline counters for the hero. */
export function platformStats() {
  return repo.servers.platformStats()
}

/* ── discovery rails, used by the home page and game worlds ─────────────── */

export function highOnline(gameId?: string, limit = 6) {
  return listServers({ gameId, sort: 'online', verifiedOnly: true, limit })
}

export async function risingServers(gameId?: string, limit = 5) {
  const items = await listServers({ gameId, sort: 'growth', hideOffline: true, limit: limit + 6 })
  return items.filter((server) => server.trendScore > 10 && !server.launch).slice(0, limit)
}

export function openingServers(gameId?: string, limit = 6) {
  return listServers({ gameId, onlyLaunching: true, sort: 'launch', limit })
}

export async function promotedServers(gameId?: string, limit = 4) {
  const items = await listServers({ gameId, sort: 'recommended', limit: 60 })
  const order: Record<string, number> = { TOP: 0, FEATURED: 1, VIP: 2 }
  return items
    .filter((server) => server.promo)
    .sort((a, b) => (order[a.promo!] ?? 9) - (order[b.promo!] ?? 9))
    .slice(0, limit)
}

export function recentlyAdded(gameId?: string, limit = 4) {
  return listServers({ gameId, sort: 'new', limit })
}

/* ── search suggestions ─────────────────────────────────────────────────── */

export interface Suggestion {
  kind: 'game' | 'server' | 'mode'
  label: string
  sub: string
  to: string
  accent?: string
}

export async function buildSuggestions(text: string, limit = 7): Promise<Suggestion[]> {
  const term = text.trim().toLowerCase()
  const out: Suggestion[] = []
  const games = await repo.games.list()

  for (const game of games
    .filter((game) => !term || game.name.toLowerCase().includes(term) || game.shortName.toLowerCase().includes(term))
    .slice(0, term ? 3 : 2)) {
    out.push({
      kind: 'game',
      label: game.name,
      sub: `${game.serversCount.toLocaleString('ru-RU')} серверов`,
      to: `/${game.slug}`,
      accent: game.accent,
    })
  }

  const servers = await listServers(
    term ? { query: term, sort: 'online', limit: 4 } : { sort: 'online', verifiedOnly: true, limit: 3 },
  )
  for (const server of servers) {
    const game = games.find((item) => item.id === server.gameId)
    out.push({
      kind: 'server',
      label: server.name,
      sub: `${game?.shortName ?? ''} · ${server.version}`,
      to: `/server/${server.slug}`,
    })
  }

  if (term) {
    const modes = new Set<string>()
    for (const game of games) for (const mode of game.modes) if (mode.toLowerCase().includes(term)) modes.add(mode)
    for (const mode of Array.from(modes).slice(0, 2)) {
      out.push({ kind: 'mode', label: mode, sub: 'Режим игры', to: `/catalog?mode=${encodeURIComponent(mode)}` })
    }
  }

  return out.slice(0, limit)
}

export const QUICK_SEARCHES = [
  { label: 'Minecraft Survival', to: '/catalog?game=minecraft&mode=Survival' },
  { label: 'GTA RP', to: '/gta-rp' },
  { label: 'Lineage 2 High Five', to: '/lineage-2/high-five' },
  { label: 'Rust x2', to: '/rust' },
  { label: 'CS2 Retake', to: '/catalog?game=cs2&mode=Retake' },
]
