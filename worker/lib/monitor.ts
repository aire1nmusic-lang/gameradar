/**
 * The online fallback chain: DIRECT → OFFICIAL → EXTERNAL → UNKNOWN.
 *
 *   DIRECT    our own probe; the only tier that can be VERIFIED. An answer
 *             (VERIFIED, LIVE or ANOMALY) ends the chain.
 *   OFFICIAL  a counter the project publishes itself → OWNER_REPORTED.
 *   EXTERNAL  a third-party monitor → EXTERNAL.
 *   UNKNOWN   nothing answered and nobody said the server is down.
 *
 * "Down" is a fact only when a source says so: a failed direct probe or a
 * monitor reporting the server offline gives OFFLINE; an API outage gives
 * UNKNOWN, never a false OFFLINE.
 */
import { probe, type ProbeResult, type ProbeTarget } from '../adapters/games.ts'
import { readSource, sourceAvailable, type OnlineSource, type SourceSecrets } from '../adapters/sources.ts'
import type { NetworkOptions } from '../adapters/network.ts'
import type { TcpOptions } from '../adapters/tcp.ts'

export type SourceTierName = 'DIRECT' | 'OFFICIAL' | 'EXTERNAL'

export interface OnlineResult {
  status: ProbeResult['status'] | 'OWNER_REPORTED' | 'EXTERNAL' | 'UNKNOWN'
  online: number | null
  maxOnline: number | null
  /** player-facing source name */
  source: string
  sourceUrl: string | null
  tier: SourceTierName | null
  method: string
  latencyMs: number | null
  /** when GameScout fetched it */
  checkedAt: string
  /** when the number was true according to its source */
  observedAt: string
  note?: string
}

const TIER_ORDER: Record<string, number> = { OFFICIAL: 0, EXTERNAL: 1 }

export async function resolveOnline(
  target: ProbeTarget | null,
  sources: OnlineSource[],
  options: TcpOptions & NetworkOptions = {},
  secrets: SourceSecrets = {},
): Promise<OnlineResult> {
  let fallback: OnlineResult | undefined
  let directFailed = false

  if (target) {
    // One lost packet must not flip a live server to OFFLINE: retry once.
    let result = await probe(target, options)
    if (result.status === 'OFFLINE') result = await probe(target, options)
    const direct: OnlineResult = { ...result, sourceUrl: null, tier: 'DIRECT', observedAt: result.checkedAt }
    if (result.status !== 'OFFLINE') return direct
    fallback = direct
    directFailed = true
  }

  const errors: string[] = []
  for (const source of sources.filter(item => sourceAvailable(item.provider, secrets)).sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9))) {
    const startedAt = Date.now()
    try {
      const reading = await readSource(source, options, secrets)
      const base = {
        source: source.name,
        sourceUrl: source.url ?? null,
        tier: source.tier,
        method: source.tier === 'OFFICIAL' ? 'OFFICIAL_SOURCE' : 'EXTERNAL_MONITOR',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        observedAt: reading.observedAt,
      } as const
      if (reading.up && reading.online !== null) {
        return {
          ...base,
          status: source.tier === 'OFFICIAL' ? 'OWNER_REPORTED' : 'EXTERNAL',
          online: reading.online,
          maxOnline: reading.maxOnline,
          ...(directFailed ? { note: 'Прямая проверка GameScout не прошла; число — по данным источника.' } : {}),
        }
      }
      if (!reading.up && !fallback) fallback = { ...base, status: 'OFFLINE', online: null, maxOnline: null, note: `По данным ${source.name} сервер не отвечает.` }
    } catch (error) {
      errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (fallback) return fallback
  const now = new Date().toISOString()
  return {
    status: 'UNKNOWN',
    online: null,
    maxOnline: null,
    source: 'Нет данных',
    sourceUrl: null,
    tier: null,
    method: 'NONE',
    latencyMs: null,
    checkedAt: now,
    observedAt: now,
    note: errors.length ? `Источники онлайна недоступны: ${errors.join('; ')}` : 'Источники онлайна не настроены',
  }
}
