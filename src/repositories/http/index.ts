import { fetchApiResponse } from './publicRead'
import type { Game, GameServer, OnlineSample, OwnerProject, Page, ServerClaim, RankedServer, ServerQuery, User, Vote, VoteIntegration } from '@/models'
import type { Repositories } from '../types'
import { cacheGames, hydrateGames } from '@/data/games'
import { isLiveGame } from '@/data/liveGames'

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}

export function createHttpRepositories(base = '/api/v1'): Repositories {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetchApiResponse(base + path, {
        credentials: 'same-origin', ...options,
        headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      })
    } catch { throw new Error('API недоступен. Проверьте, запущен ли локальный Worker.') }
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new HttpError(response.status, body?.error?.code ?? 'http_error', body?.error?.message ?? 'Не удалось выполнить запрос')
    if (!body && response.status !== 204) throw new Error('API вернул некорректный ответ')
    return body as T
  }
  const send = <T,>(path: string, input: unknown, method = 'POST') => request<T>(path, { method, body: JSON.stringify(input) })
  const params = (query: object) => {
    const search = new URLSearchParams()
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length))
        search.set(name, Array.isArray(value) ? value.join(',') : String(value))
    }
    return search.size ? '?' + search.toString() : ''
  }
  const bySlug = async (slug: string) => {
    try {
      const server = await request<GameServer>('/servers/' + encodeURIComponent(slug))
      // A card of a hidden game is not reachable, even by a direct link.
      return isLiveGame(server.gameId) ? server : undefined
    }
    catch (error) { if (error instanceof HttpError && error.status === 404) return undefined; throw error }
  }
  async function allServers(query: ServerQuery = {}): Promise<GameServer[]> {
    const items: GameServer[] = []
    let offset = 0
    while (true) {
      const page = await request<Page<GameServer>>('/servers' + params({ ...query, limit: 100, offset }))
      items.push(...page.items.filter(server => isLiveGame(server.gameId)))
      offset += page.items.length
      if (!page.items.length || offset >= page.total) return items
    }
  }
  // One request serves every caller for a minute: a single page asks for the game list from up to five places.
  let gamesRequest: Promise<Game[]> | undefined
  let gamesRequestedAt = 0
  const listGames = () => {
    if (!gamesRequest || Date.now() - gamesRequestedAt > 60_000) {
      gamesRequestedAt = Date.now()
      const pending = request<Game[]>('/games').then((all) => {
        const games = all.filter(game => isLiveGame(game.id))
        hydrateGames(games); cacheGames(games); return games
      })
      pending.catch(() => { if (gamesRequest === pending) gamesRequest = undefined })
      gamesRequest = pending
    }
    return gamesRequest
  }
  const current = async () => (await request<{ user: User | null }>('/auth/me')).user ?? undefined
  const leaderboard = async (gameId?: string, chronicleId?: string) => {
    if (gameId && !isLiveGame(gameId)) return []
    const rows = await request<RankedServer[]>('/rating' + params({ gameId, chronicleId }))
    return rows.filter(row => isLiveGame(row.server.gameId)).map((row, index) => ({ ...row, rank: index + 1, organicRank: index + 1 }))
  }
  const unsupported = async (): Promise<never> => { throw new Error('Эта функция пока не подключена') }

  return {
    games: {
      list: listGames,
      byId: async id => (await listGames()).find(game => game.id === id),
      bySlug: async slug => (await listGames()).find(game => game.slug === slug),
      chronicles: async id => (await listGames()).find(game => game.id === id)?.chronicles ?? [],
    },
    servers: {
      query: async query => {
        if (query.gameId && !isLiveGame(query.gameId)) return { items: [], total: 0, offset: query.offset ?? 0, limit: query.limit ?? 0 }
        if (!query.gameId) {
          // Mixed lists drop hidden games; paging is done here so pages stay full.
          const items = await allServers(query)
          const offset = query.offset ?? 0
          const limit = query.limit ?? items.length
          return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }
        }
        if ((query.limit ?? 0) > 100) {
          const items = await allServers(query)
          const offset = query.offset ?? 0
          return { items: items.slice(offset, offset + (query.limit ?? items.length)), total: items.length, offset, limit: query.limit ?? items.length }
        }
        return request<Page<GameServer>>('/servers' + params(query))
      },
      bySlug,
      byId: bySlug,
      similar: async (slug, limit = 3) => {
        const server = await bySlug(slug)
        if (!server) return []
        const modes = new Set(server.modes.map(mode => mode.toLocaleLowerCase('ru')))
        return (await allServers({ gameId: server.gameId }))
          .filter(item => item.id !== server.id)
          .sort((a, b) => {
            if (a.demo !== b.demo) return a.demo ? 1 : -1
            const overlap = (item: GameServer) => item.modes.filter(mode => modes.has(mode.toLocaleLowerCase('ru'))).length
            return overlap(b) - overlap(a)
              || Number(b.version === server.version) - Number(a.version === server.version)
              || a.name.localeCompare(b.name, 'ru')
              || a.id.localeCompare(b.id)
          })
          .slice(0, limit)
      },
      facets: async gameId => {
        const servers = await allServers({ gameId })
        const unique = (values: string[]) => [...new Set(values)].filter(Boolean)
        return { versions: unique(servers.map(s => s.version)), modes: unique(servers.flatMap(s => s.modes)), regions: unique(servers.map(s => s.region)), languages: unique(servers.flatMap(s => s.languages)) }
      },
      submit: input => send<GameServer>('/servers', input),
      onlineHistory: (id, range = '24h') => request<OnlineSample[]>('/servers/' + encodeURIComponent(id) + '/online-history' + params({ range })),
      platformStats: async () => {
        const [games, servers] = await Promise.all([listGames(), allServers()])
        return { games: games.length, servers: servers.length, playersOnline: games.reduce((sum, g) => sum + g.playersOnline, 0), verifiedServers: servers.filter(s => s.online.status === 'VERIFIED' && s.online.freshness === 'fresh').length, measuredServers: servers.filter(s => s.online.freshness === 'fresh' && s.online.playersKnown !== false).length, checksPerMinute: 0 }
      },
    },
    rating: {
      leaderboard, organic: leaderboard,
      positionOf: async (slug, gameId) => (await leaderboard(gameId)).find(row => row.server.slug === slug),
    },
    votes: {
      cast: input => send<Vote>('/votes', { serverId: input.serverId, nickname: input.nickname }),
      eligibility: (serverId, nickname) => request('/votes/eligibility' + params({ serverId, nickname })),
      recent: unsupported,
      countFor: async id => (await bySlug(id))?.votes ?? 0,
      integration: id => request<VoteIntegration>('/servers/' + encodeURIComponent(id) + '/vote-integration'),
      reward: id => request<VoteIntegration>('/servers/' + encodeURIComponent(id) + '/reward'),
    },
    users: {
      current,
      session: () => request('/auth/me'),
      login: input => send('/auth/dev', input),
      logout: () => send('/auth/logout', {}),
    },
    owners: {
      current: async () => { const user = await current(); return user ? { id: user.id, userId: user.id, serverIds: [], createdAt: user.createdAt } : undefined },
      serversOf: async () => (await request<Page<GameServer>>('/owners/me/servers')).items,
      /**
       * Card analytics.
       *
       * Only numbers the platform actually stores are reported. Views, clicks
       * and referrers are not collected yet, so they are returned as zero with
       * an explicit hint instead of being invented.
       */
      analytics: async (): Promise<OwnerProject[]> => {
        const [page, ranking] = await Promise.all([
          request<Page<GameServer>>('/owners/me/servers'),
          leaderboard().catch(() => [] as RankedServer[]),
        ])
        return page.items.map(server => {
          const position = ranking.findIndex(row => row.server.id === server.id)
          return {
            server,
            metrics: [
              { key: 'votes', label: 'Голоса', value: server.votes, change: 0, format: 'number' as const, hint: 'Голоса игроков, полученные через GameScout' },
              { key: 'online', label: 'Игроков сейчас', value: server.online.current, change: server.online.change24h, format: 'number' as const, hint: 'По последней проверке мониторинга' },
              { key: 'views', label: 'Просмотры карточки', value: 0, change: 0, format: 'number' as const, hint: 'Сбор статистики просмотров ещё не включён' },
              { key: 'clicks', label: 'Переходы на сервер', value: 0, change: 0, format: 'number' as const, hint: 'Сбор статистики переходов ещё не включён' },
            ],
            views: [],
            clicks: [],
            rankPosition: position >= 0 ? position + 1 : 0,
            rankTotal: ranking.length,
            rankChange: 0,
            sources: [],
            countries: [],
          }
        })
      },
      claim: input => send<ServerClaim>('/claims', { serverId: input.serverId, method: input.method }),
      claims: () => request<ServerClaim[]>('/owners/me/claims'),
      claimById: id => request<ServerClaim>('/claims/' + encodeURIComponent(id)),
      verifyClaim: id => send<ServerClaim>('/claims/' + encodeURIComponent(id) + '/verify', {}),
      updateServer: (id, input) => send<GameServer>('/servers/' + encodeURIComponent(id), input, 'PATCH'),
      updateIntegration: (id, input) => send<VoteIntegration>('/servers/' + encodeURIComponent(id) + '/vote-integration', input, 'PATCH'),
      rotateApiKey: id => send<{ apiKey: string }>('/servers/' + encodeURIComponent(id) + '/api-key', {}),
    },
    boosts: { packages: async () => [], activeFor: async () => 0, forecast: unsupported, createOrder: unsupported },
    ads: { forSlot: async () => undefined, products: async () => [] },
  }
}
