import { repo } from '@/repositories'
import type { GameServer, Page, ServerQuery, SortKey } from '@/models'
import { apiRequest } from '@/repositories/http/client'
import type { CatalogFilters } from './filterState'
import { visualDemo } from './visualDemo'
import { balancedCatalog } from './discoveryRanking'

/**
 * Catalogue use-cases: searching, filtering and the discovery rails.
 *
 * Components call this, never a repository and never a fixture.
 */

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recommended', label: 'Общий топ' },
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

export function searchServers(query: ServerQuery, demo = false): Promise<Page<GameServer>> {
  if (demo) return demoSortedServers(query)
  if (query.sort === 'recommended') return balancedSortedServers(query)
  return repo.servers.query(query)
}

async function publicCards(query: ServerQuery): Promise<GameServer[]> {
  const items: GameServer[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await repo.servers.query({ ...query, sort: 'new', offset, limit: 100 })
    items.push(...page.items)
    if (!page.items.length || items.length >= page.total) break
  }
  return items
}

export function invalidateDiscoveryCache(){ discoveryCache.clear() }
const discoveryCache=new Map<string,{at:number;result:Promise<GameServer[]>}>()
export function discoveryServers(query:ServerQuery={},demo=false):Promise<GameServer[]>{
 const key=JSON.stringify(query),cached=discoveryCache.get(key)
 let result=cached&&Date.now()-cached.at<15000?cached.result:undefined
 if(!result){result=loadDiscoveryServers(query);discoveryCache.set(key,{at:Date.now(),result});result.catch(()=>discoveryCache.delete(key))}
 return demo?result.then(visualDemo):result
}
async function demoSortedServers(query:ServerQuery):Promise<Page<GameServer>>{
 const universe=await discoveryServers({gameId:query.gameId,gameIds:query.gameIds},true)
 const filtered=await publicCards({...query,limit:undefined,offset:0}),ids=new Set(filtered.map(s=>s.id))
 let sorted=universe.filter(s=>ids.has(s.id))
 if(query.sort==='recommended'){const order=new Map(balancedCatalog(universe).map((s,i)=>[s.id,i]));sorted.sort((a,b)=>order.get(a.id)!-order.get(b.id)!)}
 else if(query.sort==='votes')sorted.sort((a,b)=>b.votes-a.votes)
 else if(query.sort==='support')sorted.sort((a,b)=>(b.support?.coins??0)-(a.support?.coins??0))
 else {const order=new Map(filtered.map((s,i)=>[s.id,i]));sorted.sort((a,b)=>order.get(a.id)!-order.get(b.id)!)}
 const offset=query.offset??0,limit=query.limit??24
 return {items:sorted.slice(offset,offset+limit),total:sorted.length,offset,limit}
}
async function loadDiscoveryServers(query: ServerQuery = {}): Promise<GameServer[]> {
  const load = async (path: string) => {
    const rows: Array<{server_id:string;votes?:number;coins?:number;participants?:number}> = []
    for (let offset = 0; ; offset += 100) {
      const page = await apiRequest<typeof rows>(`${path}?limit=100&offset=${offset}`, { signal: AbortSignal.timeout(8000) })
      if (!Array.isArray(page)) throw new Error('Некорректный ответ рейтинга')
      rows.push(...page)
      if (page.length < 100) return rows
    }
  }
  // Rankings are optional enrichment. A failed/slow aggregate must not hide public cards.
  const [items, peopleResult, supportResult] = await Promise.all([
    publicCards(query), load('/people-rating').then(rows => ({ rows }), () => ({ rows: undefined })),
    load('/support/ranking').then(rows => ({ rows }), () => ({ rows: undefined })),
  ])
  const people = peopleResult.rows ?? []
  const support = supportResult.rows ?? []
  const votes = new Map(people.map(row => [row.server_id, row.votes ?? 0]))
  const coins = new Map(support.map(row => [row.server_id, row]))
  return items.map(server => ({...server,
    rankingAvailability: { votes: !!peopleResult.rows, support: !!supportResult.rows },
    votes: peopleResult.rows ? votes.get(server.id) ?? 0 : server.votes,
    support: supportResult.rows ? {coins: coins.get(server.id)?.coins ?? 0, participants: coins.get(server.id)?.participants ?? 0} : server.support,
  }))
}

async function balancedSortedServers(query: ServerQuery): Promise<Page<GameServer>> {
  const universe = await discoveryServers({gameId: query.gameId, gameIds: query.gameIds})
  const order = new Map(balancedCatalog(universe).map((server, index) => [server.id, index]))
  const filtered = await publicCards({...query, offset: 0, limit: undefined})
  const enriched = new Map(universe.map(server => [server.id, server]))
  const sorted = filtered.map(server => enriched.get(server.id) ?? server).sort((a,b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity))
  const offset = query.offset ?? 0, limit = query.limit ?? 24
  return {items: sorted.slice(offset, offset + limit), total: sorted.length, offset, limit}
}

/** Read-only join at the UI boundary: private vote counts order public cards. */
async function privateAggregateSort(query: ServerQuery, path: string, field: 'votes' | 'coins'): Promise<Page<GameServer>> {
  const ranking = async () => {
    const rows: Array<{server_id:string;votes?:number;coins?:number;participants?:number}> = []
    for (let offset=0; ; offset+=100) {
      const page=await apiRequest<Array<{server_id:string;votes?:number;coins?:number;participants?:number}>>(`${path}?limit=100&offset=${offset}`, {signal:AbortSignal.timeout(8000)})
      if(!Array.isArray(page))throw new Error('Некорректный ответ рейтинга')
      rows.push(...page)
      if (page.length<100) return rows
    }
  }
  const [catalog, rankingRows]=await Promise.all([
    repo.servers.query({...query,sort:'recommended',offset:0,limit:Number.MAX_SAFE_INTEGER}),ranking().catch(()=>undefined),
  ])
  const score=new Map((rankingRows??[]).map(row=>[row.server_id,row[field]??0]))
  const support=new Map((rankingRows??[]).map(row=>[row.server_id,{coins:row.coins??0,participants:row.participants??0}]))
  const cards=rankingRows?(field==='coins'?catalog.items.map(card=>({...card,support:support.get(card.id)??{coins:0,participants:0}})):catalog.items):catalog.items.map(card=>({...card,rankingAvailability:{votes:field!=='votes',support:field!=='coins'}}))
  const value=(card:GameServer)=>rankingRows?(score.get(card.id)??0):field==='coins'?(card.support?.coins??0):card.votes
  const sorted=[...cards].sort((a,b)=>value(b)-value(a) || a.name.localeCompare(b.name,'ru') || a.id.localeCompare(b.id))
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

export async function buildSuggestions(text: string, limit = 7, gameId?:string): Promise<Suggestion[]> {
  const term = text.trim().toLowerCase()
  const out: Suggestion[] = []
  const games = (await repo.games.list()).filter(game=>!gameId||game.id===gameId)

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
    term ? { gameId,query: term, sort: 'online', limit: 4 } : { gameId,sort: 'online', verifiedOnly: true, limit: 3 },
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
      out.push({ kind: 'mode', label: mode, sub: 'Режим игры', to: `/catalog?mode=${encodeURIComponent(mode)}${gameId?`&game=${encodeURIComponent(gameId)}`:''}` })
    }
  }

  return out.slice(0, limit)
}

export const QUICK_SEARCHES = [
  { label: 'Minecraft Survival', to: '/catalog?game=minecraft&mode=Survival' },
  { label: 'GTA RP', to: '/gta-rp' },
  { label: 'Lineage 2 High Five', to: '/lineage-2/high-five' },
  { label: 'Lineage 2 Interlude', to: '/lineage-2/interlude' },
]
