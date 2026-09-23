/**
 * Online numbers GameScout did not measure itself.
 *
 * One small adapter per source — no universal scraper. Each returns what the
 * source says and *when* it was true, so a cached or stale number is never
 * presented as current. None of these can produce VERIFIED: the caller stores
 * them as OWNER_REPORTED (the project's own site) or EXTERNAL (a third party).
 */
import { AdapterError, fetchPublicText, type NetworkOptions } from './network.ts'

export type SourceTier = 'OFFICIAL' | 'EXTERNAL'

export interface OnlineSource {
  tier: SourceTier
  provider: string
  /** player-facing name, e.g. "mcsrvstat.us" */
  name: string
  /** public page a player can open */
  url?: string | null
  config: Record<string, unknown>
}

export interface SourceReading {
  /** what the source says about reachability */
  up: boolean
  online: number | null
  maxOnline: number | null
  /** when the number was true according to the source */
  observedAt: string
}

const MAX_PLAYERS = 10_000_000

/** "1 234", "1,234", 1234 → 1234; anything else → null. */
export function count(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(String(value).replace(/[\s\u00a0\u202f,]/g, ''))
  return Number.isInteger(n) && n >= 0 && n < MAX_PLAYERS ? n : null
}

/** Epoch seconds, epoch ms or ISO → ISO; never in the future. */
function observed(value: unknown, fallback: string): string {
  let time = NaN
  if (typeof value === 'number') time = value < 1e12 ? value * 1000 : value
  else if (typeof value === 'string') time = Date.parse(value)
  if (!Number.isFinite(time)) return fallback
  return new Date(Math.min(time, Date.parse(fallback))).toISOString()
}

async function json(url: string, options: NetworkOptions): Promise<unknown> {
  const body = await fetchPublicText(url, { timeoutMs: 6000, maxBytes: 524288, ...options })
  try {
    return JSON.parse(body)
  } catch {
    throw new AdapterError('invalid_payload', 'Source did not return JSON')
  }
}

/**
 * "players.online", "data[0].count", "data[id=6].online" — the last form picks
 * the array element whose field equals the value, so a world is matched by
 * its id rather than by a position that changes with sorting.
 */
export function pick(value: unknown, path: string): unknown {
  let current: unknown = value
  for (const [, key, field, expected, index] of path.matchAll(/([^.[\]]+)|\[(\w+)=([^\]]+)\]|\[(\d+)\]/g)) {
    if (current === null || typeof current !== 'object') return undefined
    if (field) {
      if (!Array.isArray(current)) return undefined
      current = current.find(item => item && typeof item === 'object' && String((item as Record<string, unknown>)[field]) === expected)
    } else current = (current as Record<string, unknown>)[key ?? index]
  }
  return current
}

const str = (config: Record<string, unknown>, key: string): string => {
  const value = config[key]
  if (typeof value !== 'string' || !value) throw new AdapterError('invalid_config', `Source config needs ${key}`)
  return value
}

interface SteamServer {
  addr?: unknown
  gameport?: unknown
  players?: unknown
  max_players?: unknown
  gametype?: unknown
}

/** Credentials some sources need; a source without its credential is skipped, not failed. */
export interface SourceSecrets {
  steamKey?: string
}

type Provider = (config: Record<string, unknown>, options: NetworkOptions, secrets: SourceSecrets) => Promise<SourceReading>

/** Valve master-server filter for one game address: \gameaddr\ip:port */
const STEAM_FILTER = '\\gameaddr\\'

/** Which secret a provider cannot run without. */
const REQUIRES: Partial<Record<string, keyof SourceSecrets>> = { steam: 'steamKey' }

export function sourceAvailable(provider: string, secrets: SourceSecrets = {}): boolean {
  const secret = REQUIRES[provider]
  return !!PROVIDERS[provider] && (!secret || !!secrets[secret])
}

export const PROVIDERS: Record<string, Provider> = {
  /**
   * api.mcsrvstat.us v3 — public, documented, needs a descriptive User-Agent
   * (fetchPublicText sends one). It pings the server itself and caches for
   * about a minute; debug.cachetime says when.
   */
  async mcsrvstat(config, options) {
    const now = new Date().toISOString()
    const data = (await json(`https://api.mcsrvstat.us/3/${encodeURIComponent(str(config, 'address'))}`, { ...options, trustedHost: true })) as {
      online?: boolean
      players?: { online?: unknown; max?: unknown }
      debug?: { cachetime?: unknown }
    }
    return {
      up: data.online === true,
      online: data.online ? count(data.players?.online) : null,
      maxOnline: data.online ? count(data.players?.max) : null,
      observedAt: observed(data.debug?.cachetime, now),
    }
  },

  /** api.mcstatus.io v2 — public, documented, cached ~1 min (retrieved_at). */
  async mcstatus(config, options) {
    const now = new Date().toISOString()
    const data = (await json(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(str(config, 'address'))}`, { ...options, trustedHost: true })) as {
      online?: boolean
      retrieved_at?: unknown
      players?: { online?: unknown; max?: unknown }
    }
    return {
      up: data.online === true,
      online: data.online ? count(data.players?.online) : null,
      maxOnline: data.online ? count(data.players?.max) : null,
      observedAt: observed(data.retrieved_at, now),
    }
  },

  /**
   * BattleMetrics public API — documented, unauthenticated reads are rate
   * limited. It queries servers over A2S, which a Worker cannot (no UDP).
   */
  async battlemetrics(config, options) {
    const now = new Date().toISOString()
    const id = str(config, 'id')
    if (!/^\d{1,12}$/.test(id)) throw new AdapterError('invalid_config', 'BattleMetrics id must be numeric')
    const data = (await json(`https://api.battlemetrics.com/servers/${id}`, { ...options, trustedHost: true })) as {
      data?: { attributes?: { status?: string; players?: unknown; maxPlayers?: unknown; updatedAt?: unknown } }
    }
    const attributes = data.data?.attributes
    if (!attributes) throw new AdapterError('invalid_payload', 'BattleMetrics answered without a server')
    const up = attributes.status === 'online'
    return {
      up,
      online: up ? count(attributes.players) : null,
      maxOnline: up ? count(attributes.maxPlayers) : null,
      observedAt: observed(attributes.updatedAt, now),
    }
  },

  /**
   * Steam Web API IGameServersService/GetServerList — Valve's master server,
   * filtered to one game address. Needs a Steam Web API key (STEAM_API_KEY);
   * the key travels only in this request and never appears in errors or logs.
   *
   *   · 403 (bad key) and 429 (rate limit) are errors → UNKNOWN, never OFFLINE;
   *   · an answer for another address is refused (address_mismatch);
   *   · not listed at all → "down" as the master server sees it;
   *   · Rust reports true counts in gametype tags cpN/mpN, because the plain
   *     player fields wrap above 255.
   */
  async steam(config, options, secrets) {
    const now = new Date().toISOString()
    const address = str(config, 'address')
    const match = /^(\d+\.\d+\.\d+\.\d+):(\d{1,5})$/.exec(address)
    if (!match) throw new AdapterError('invalid_config', 'Steam address must be ip:port')
    if (!secrets.steamKey) throw new AdapterError('missing_secret', 'Steam Web API key is not configured')
    const [, ip, port] = match
    const url = `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${encodeURIComponent(secrets.steamKey)}&limit=5&filter=${encodeURIComponent(STEAM_FILTER + address)}`
    let data: { response?: { servers?: SteamServer[] } }
    try {
      data = (await json(url, { ...options, trustedHost: true })) as typeof data
    } catch (error) {
      // Never surface the request URL: it carries the key.
      const code = error instanceof AdapterError ? error.code : 'steam_failed'
      if (code === 'http_403') throw new AdapterError('steam_forbidden', 'Steam Web API rejected the key')
      if (code === 'http_429') throw new AdapterError('rate_limited', 'Steam Web API rate limit reached')
      throw new AdapterError(code, 'Steam Web API request failed')
    }
    if (!data.response || typeof data.response !== 'object') throw new AdapterError('invalid_payload', 'Steam Web API answered without a response')
    const servers = Array.isArray(data.response.servers) ? data.response.servers : []
    if (!servers.length) return { up: false, online: null, maxOnline: null, observedAt: now }
    const server = servers.find(item => String(item.addr ?? '').split(':')[0] === ip && (String(item.gameport) === port || String(item.addr ?? '').endsWith(':' + port)))
    if (!server) throw new AdapterError('address_mismatch', 'Steam listed a different address')
    const tags = String(server.gametype ?? '')
    const tagged = (key: string) => count(new RegExp(`(?:^|,)${key}(\\d+)(?:,|$)`).exec(tags)?.[1])
    return {
      up: true,
      online: tagged('cp') ?? count(server.players),
      maxOnline: tagged('mp') ?? count(server.max_players),
      observedAt: now,
    }
  },

  /** The project's own JSON endpoint, read at a fixed path. */
  async official_json(config, options) {
    const now = new Date().toISOString()
    const data = await json(str(config, 'url'), options)
    const online = count(pick(data, str(config, 'path')))
    if (online === null) throw new AdapterError('invalid_payload', 'Official endpoint did not contain a player count')
    const max = typeof config.maxPath === 'string' ? count(pick(data, config.maxPath)) : null
    return { up: true, online, maxOnline: max, observedAt: now }
  },

  /**
   * A number the project renders into its own page. The pattern is curated
   * per server in the dataset (never user input) and must capture one group.
   */
  async official_html(config, options) {
    const now = new Date().toISOString()
    const pattern = str(config, 'regex')
    if (pattern.length > 200) throw new AdapterError('invalid_config', 'Pattern too long')
    const html = await fetchPublicText(str(config, 'url'), { timeoutMs: 6000, maxBytes: 1048576, ...options })
    const online = count(new RegExp(pattern, 'i').exec(html)?.[1])
    if (online === null) throw new AdapterError('invalid_payload', 'Official page did not contain a player count')
    return { up: true, online, maxOnline: null, observedAt: now }
  },
}

export async function readSource(source: OnlineSource, options: NetworkOptions = {}, secrets: SourceSecrets = {}): Promise<SourceReading> {
  const provider = PROVIDERS[source.provider]
  if (!provider) throw new AdapterError('invalid_config', `Unknown online source ${source.provider}`)
  return provider(source.config, options, secrets)
}
