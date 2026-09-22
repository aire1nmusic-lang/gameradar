/**
 * Per-game online probes.
 *
 * Each adapter answers one question: what can GameScout state about this
 * server *on its own authority*?
 *
 *   VERIFIED — we obtained the player count ourselves
 *   LIVE     — the server answered, but the protocol does not expose a count
 *   OFFLINE  — no answer
 *
 * An owner-supplied number never produces VERIFIED. That rule is the product,
 * so it lives in the adapter layer rather than in a route.
 */
import { AdapterError, fetchPublicText, type NetworkOptions } from './network.ts'
import { concatBytes, withTcp, type TcpOptions } from './tcp.ts'

export interface ProbeResult {
  status: 'VERIFIED' | 'LIVE' | 'OFFLINE'
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
 * The count comes from the server's own status response, so it is as
 * trustworthy as the server chooses to be — but we obtained it ourselves,
 * over the game protocol, without the owner typing anything.
 */
export async function probeMinecraft(host: string, port = 25565, options: TcpOptions = {}): Promise<ProbeResult> {
  const startedAt = Date.now()
  const source = `Minecraft SLP ${host}:${port}`
  try {
    const status = await withTcp(host, port, { timeoutMs: 6000, ...options }, async (reader, writer) => {
      const handshake = packet(0x00, varInt(765), mcString(host), new Uint8Array([port >> 8, port & 0xff]), varInt(1))
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
      status: 'VERIFIED',
      online: Number.isFinite(online) && online >= 0 ? Math.trunc(online) : null,
      maxOnline: Number.isFinite(max) && max >= 0 ? Math.trunc(max) : null,
      source,
      method: 'GAME_PROTOCOL',
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    }
  } catch (error) {
    return failure(source, 'GAME_PROTOCOL', startedAt, String(error instanceof Error ? error.message : error))
  }
}

/* ── FiveM / GTA RP: public server endpoints ──────────────────────────────── */

/**
 * FiveM exposes the connected players as a list, so the count is a fact we
 * read rather than a number the server declares.
 */
export async function probeFiveM(baseUrl: string, options: NetworkOptions = {}): Promise<ProbeResult> {
  const startedAt = Date.now()
  const source = `FiveM ${new URL(baseUrl).host}`
  try {
    const players = JSON.parse(
      await fetchPublicText(new URL('/players.json', baseUrl).toString(), { timeoutMs: 6000, maxBytes: 262144, ...options }),
    )
    if (!Array.isArray(players)) throw new AdapterError('invalid_payload', 'players.json must be an array')

    let maxOnline: number | null = null
    try {
      const info = JSON.parse(
        await fetchPublicText(new URL('/info.json', baseUrl).toString(), { timeoutMs: 6000, maxBytes: 262144, ...options }),
      ) as { vars?: Record<string, unknown> }
      const declared = Number(info.vars?.sv_maxClients)
      if (Number.isFinite(declared) && declared > 0) maxOnline = Math.trunc(declared)
    } catch {
      // The slot count is optional; the player count is what we came for.
    }

    return {
      status: 'VERIFIED',
      online: players.length,
      maxOnline,
      source,
      method: 'SERVER_API',
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    }
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
}

/** Picks the adapter a target's game supports. */
export async function probe(target: ProbeTarget, options: TcpOptions & NetworkOptions = {}): Promise<ProbeResult> {
  const startedAt = Date.now()
  if (target.method === 'SERVER_API' || target.gameSlug === 'gta-rp') {
    if (!target.apiUrl) return failure('FiveM', 'SERVER_API', startedAt, 'Не указан адрес API сервера')
    return probeFiveM(target.apiUrl, options)
  }
  if (!target.host) return failure('GameScout', 'GAME_PROTOCOL', startedAt, 'Не указан адрес сервера')
  if (target.gameSlug === 'lineage-2' || target.method === 'LOGIN_SERVER') {
    return probeLineage2(target.host, target.port ?? 2106, options)
  }
  if (target.gameSlug === 'minecraft' || target.method === 'GAME_PROTOCOL') {
    return probeMinecraft(target.host, target.port ?? 25565, options)
  }
  return failure('GameScout', 'GAME_PROTOCOL', startedAt, `Мониторинг для игры ${target.gameSlug} ещё не реализован`)
}
