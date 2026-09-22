/**
 * Per-game online probes.
 *
 * Each adapter answers one question: what can GameScout state about this
 * server *on its own authority*?
 *
 *   VERIFIED — we counted the players ourselves, directly from the endpoint of
 *              this specific server (FiveM players.json roster + identity match)
 *   LIVE     — the server answered; any number it gave is its own declaration
 *              (Minecraft SLP, FiveM dynamic.json) or there is none (Lineage 2)
 *   ANOMALY  — an endpoint answered, but as a different project
 *   OFFLINE  — no answer
 *
 * An owner-supplied or self-declared number never produces VERIFIED. That rule
 * is the product, so it lives in the adapter layer rather than in a route.
 */
import { AdapterError, fetchPublicText, memoizedResolver, resolveMinecraftSrv, type NetworkOptions } from './network.ts'
import { concatBytes, withTcp, type TcpOptions } from './tcp.ts'

export interface ProbeResult {
  status: 'VERIFIED' | 'LIVE' | 'ANOMALY' | 'OFFLINE'
  /** null when the protocol cannot tell us — never guessed */
  online: number | null
  maxOnline: number | null
  source: string
  method: 'GAME_PROTOCOL' | 'SERVER_API' | 'LOGIN_SERVER' | 'AGENT'
  latencyMs: number
  checkedAt: string
  note?: string
}

const failure = (source: string, method: ProbeResult['method'], startedAt: number, note: string): ProbeResult => ({
  status: 'OFFLINE',
  online: null,
  maxOnline: null,
  source,
  method,
  latencyMs: Date.now() - startedAt,
  checkedAt: new Date().toISOString(),
  note,
})

/* ── Minecraft: Server List Ping ──────────────────────────────────────────── */

function varInt(value: number): Uint8Array {
  const bytes: number[] = []
  let rest = value >>> 0
  do {
    let byte = rest & 0x7f
    rest >>>= 7
    if (rest) byte |= 0x80
    bytes.push(byte)
  } while (rest)
  return new Uint8Array(bytes)
}

function packet(id: number, ...payload: Uint8Array[]): Uint8Array {
  const body = concatBytes(varInt(id), ...payload)
  return concatBytes(varInt(body.length), body)
}

function mcString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value)
  return concatBytes(varInt(bytes.length), bytes)
}

/**
 * Handshake + status request, exactly as a client does.
 *
 * The result is LIVE, never VERIFIED: `players.online` is a number the server
 * writes into its own status response, and plugins can set it to anything.
 * We obtained it ourselves, over the game protocol — but we cannot confirm it.
 *
 * Without an explicit port the `_minecraft._tcp` SRV record is honoured, as
 * the vanilla client does; many networks publish only a hostname.
 */
export async function probeMinecraft(host: string, port?: number | null, options: TcpOptions = {}): Promise<ProbeResult> {
  const startedAt = Date.now()
  let source = `Minecraft SLP ${host}${port ? ':' + port : ''}`
  try {
    let address = { host, port: port ?? 25565 }
    if (!port) {
      const srv = await resolveMinecraftSrv(host, options).catch(() => undefined)
      if (srv) address = srv
    }
    if (address.host !== host || address.port !== (port ?? 25565)) source = `Minecraft SLP ${host} → ${address.host}:${address.port}`

    const status = await withTcp(address.host, address.port, { timeoutMs: 6000, ...options }, async (reader, writer) => {
      const handshake = packet(0x00, varInt(765), mcString(address.host), new Uint8Array([address.port >> 8, address.port & 0xff]), varInt(1))
      await writer.write(concatBytes(handshake, packet(0x00)))

      const length = await reader.varInt()
      if (length <= 0 || length > 65536) throw new AdapterError('invalid_packet', 'Unexpected status packet size')
      const id = await reader.varInt()
      if (id !== 0x00) throw new AdapterError('invalid_packet', 'Unexpected status packet id')
      const jsonLength = await reader.varInt()
      if (jsonLength <= 0 || jsonLength > 65536) throw new AdapterError('invalid_packet', 'Unexpected status payload size')
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(await reader.bytes(jsonLength))
      return JSON.parse(raw) as { players?: { online?: unknown; max?: unknown } }
    })

    const online = Number(status.players?.online)
    const max = Number(status.players?.max)
    return {
      status: 'LIVE',
      online: Number.isFinite(online) && online >= 0 ? Math.trunc(online) : null,
      maxOnline: Number.isFinite(max) && max >= 0 ? Math.trunc(max) : null,
      source,
      method: 'GAME_PROTOCOL',
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      note: 'Сервер отвечает по протоколу Minecraft. Число игроков сообщает сам сервер — GameScout не может подтвердить его независимо.',
    }
  } catch (error) {
    return failure(source, 'GAME_PROTOCOL', startedAt, String(error instanceof Error ? error.message : error))
  }
}

/* ── FiveM / GTA RP: the server's own HTTP endpoints ──────────────────────── */

/** FiveM colour codes (^0…^9) and whitespace never decide an identity. */
function plainName(value: unknown): string {
  return String(value ?? '').replace(/\^\d/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

type FiveMInfo = { vars?: Record<string, unknown> }
type FiveMDynamic = { clients?: unknown; sv_maxclients?: unknown; hostname?: unknown }

/**
 * Reads info.json, dynamic.json and players.json directly from the server.
 *
 * VERIFIED needs all of:
 *   · players.json answered with a roster — distinct player ids we count
 *     ourselves — that agrees with dynamic.json when both are present;
 *   · the endpoint is the server itself, not the Cfx.re relay (*.cfx.re);
 *   · when the target names the project it belongs to, info.json or
 *     dynamic.json reports that name — a reassigned IP gets ANOMALY instead.
 * A count taken only from dynamic.json is the server's own declaration: LIVE.
 */
export async function probeFiveM(baseUrl: string, options: NetworkOptions = {}, expectName?: string | null): Promise<ProbeResult> {
  const startedAt = Date.now()
  const base = new URL(baseUrl)
  const source = `FiveM ${base.host}`
  const net = memoizedResolver(options)
  const read = async (path: string): Promise<unknown> =>
    JSON.parse(await fetchPublicText(new URL(path, base).toString(), { timeoutMs: 6000, maxBytes: 262144, ...net }))
  const optional = (path: string) => read(path).catch(() => undefined)
  const result = (status: ProbeResult['status'], online: number | null, maxOnline: number | null, note?: string): ProbeResult => ({
    status,
    online,
    maxOnline,
    source,
    method: 'SERVER_API',
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    ...(note ? { note } : {}),
  })

  try {
    const [info, dynamic, players] = (await Promise.all([optional('/info.json'), optional('/dynamic.json'), optional('/players.json')])) as [
      FiveMInfo | undefined,
      FiveMDynamic | undefined,
      unknown,
    ]
    if (!info && !dynamic && players === undefined) {
      throw new AdapterError('unreachable', 'info.json, dynamic.json and players.json did not answer')
    }

    if (expectName) {
      const wanted = plainName(expectName)
      const names = [info?.vars?.sv_projectName, info?.vars?.sv_hostname, dynamic?.hostname].map(plainName).filter(Boolean)
      if (!names.some(name => name.includes(wanted))) {
        return result('ANOMALY', null, null, 'Endpoint отвечает, но от имени другого проекта. Данные не привязаны к карточке до перепроверки.')
      }
    }

    const declaredMax = Number(dynamic?.sv_maxclients ?? info?.vars?.sv_maxClients)
    const maxOnline = Number.isFinite(declaredMax) && declaredMax > 0 ? Math.trunc(declaredMax) : null
    const relayed = /(^|\.)cfx\.re$/i.test(base.hostname)
    const declared = Number(dynamic?.clients)
    const hasDeclared = dynamic?.clients !== undefined && Number.isFinite(declared) && declared >= 0

    if (Array.isArray(players)) {
      // A roster is something we can count: one entry per connected player,
      // each with its own server id. Many servers now publish placeholder
      // entries ({id: 0, name: "Player"}) — that list is just the declared
      // number in another shape, so it earns LIVE, not VERIFIED.
      const ids = players.map(player => Number((player as { id?: unknown } | null)?.id)).filter(id => Number.isInteger(id) && id > 0)
      const roster = new Set(ids).size === players.length
      const consistent = !hasDeclared || Math.abs(declared - players.length) <= Math.max(2, declared * 0.1)
      if (roster && consistent && !relayed) return result('VERIFIED', players.length, maxOnline)
      return result(
        'LIVE',
        players.length,
        maxOnline,
        relayed
          ? 'Данные получены через ретранслятор Cfx.re, а не напрямую от сервера.'
          : !roster
            ? 'Сервер отдаёт обезличенный список игроков — число игроков сообщает сам сервер.'
            : 'players.json и dynamic.json расходятся — число игроков не подтверждено.',
      )
    }

    return result(
      'LIVE',
      hasDeclared ? Math.trunc(declared) : null,
      maxOnline,
      relayed
        ? 'Данные получены через ретранслятор Cfx.re, а не напрямую от сервера.'
        : hasDeclared
          ? 'Сервер скрывает список игроков; число игроков сообщает сам сервер (dynamic.json).'
          : 'Сервер отвечает, но не публикует число игроков.',
    )
  } catch (error) {
    return failure(source, 'SERVER_API', startedAt, String(error instanceof Error ? error.message : error))
  }
}

/* ── Lineage 2: login server ──────────────────────────────────────────────── */

/**
 * The L2 login server reports reachability and a coarse load level, never an
 * exact population. That is why a Lineage 2 card can only reach LIVE without
 * the GameScout Agent — and why we refuse to print a number here.
 */
export async function probeLineage2(host: string, port = 2106, options: TcpOptions = {}): Promise<ProbeResult> {
  const startedAt = Date.now()
  const source = `Lineage 2 login ${host}:${port}`
  try {
    await withTcp(host, port, { timeoutMs: 6000, ...options }, async reader => {
      // The login server greets first; receiving the Init packet proves the
      // service is up. We read one byte and stop.
      await reader.bytes(1)
      return true
    })
    return {
      status: 'LIVE',
      online: null,
      maxOnline: null,
      source,
      method: 'LOGIN_SERVER',
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      note: 'Логин-сервер отвечает. Точный онлайн доступен только через GameScout Agent.',
    }
  } catch (error) {
    return failure(source, 'LOGIN_SERVER', startedAt, String(error instanceof Error ? error.message : error))
  }
}

/* ── dispatch ─────────────────────────────────────────────────────────────── */

export interface ProbeTarget {
  gameSlug: string
  method: string
  host?: string | null
  port?: number | null
  apiUrl?: string | null
  /** project name a directly probed endpoint must report */
  expectName?: string | null
}

/** Picks the adapter a target's game supports. */
export async function probe(target: ProbeTarget, options: TcpOptions & NetworkOptions = {}): Promise<ProbeResult> {
  const startedAt = Date.now()
  if (target.method === 'SERVER_API' || target.gameSlug === 'gta-rp') {
    if (!target.apiUrl) return failure('FiveM', 'SERVER_API', startedAt, 'Не указан адрес API сервера')
    return probeFiveM(target.apiUrl, options, target.expectName)
  }
  if (!target.host) return failure('GameScout', 'GAME_PROTOCOL', startedAt, 'Не указан адрес сервера')
  if (target.gameSlug === 'lineage-2' || target.method === 'LOGIN_SERVER') {
    return probeLineage2(target.host, target.port ?? 2106, options)
  }
  if (target.gameSlug === 'minecraft' || target.method === 'GAME_PROTOCOL') {
    return probeMinecraft(target.host, target.port, options)
  }
  return failure('GameScout', 'GAME_PROTOCOL', startedAt, `Мониторинг для игры ${target.gameSlug} ещё не реализован`)
}
