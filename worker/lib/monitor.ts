/**
 * The online fallback chain: DIRECT → OFFICIAL → EXTERNAL → UNKNOWN.
 *
 *   DIRECT    our own probe; the only tier that can be VERIFIED. An answer
 *             (VERIFIED, LIVE or ANOMALY) ends the chain.
 *   OFFICIAL  a counter the project publishes itself → OWNER_REPORTED.
 *   EXTERNAL  a third-party monitor → EXTERNAL.
 *   UNKNOWN   nothing answered and nobody said the server is down.
 *
 * OFFLINE needs a basis: a source reporting the server down, or our own probe
 * failing twice when the card has no other source to ask. A direct failure
 * while every monitor is unreachable, or an API outage, gives UNKNOWN — never
 * a false OFFLINE. A check cut short by the invocation's subrequest budget is
 * marked `skipped` and not stored at all.
 */
import { probe, type ProbeResult, type ProbeTarget } from '../adapters/games.ts'
import { readSource, sourceAvailable, type OnlineSource, type SourceSecrets } from '../adapters/sources.ts'
import { AdapterError, type NetworkOptions } from '../adapters/network.ts'
import { BUDGET_EXHAUSTED, BUDGET_MESSAGE } from './budget.ts'
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
  /** the invocation ran out of subrequests mid-check: nothing was learned, nothing is stored */
  skipped?: boolean
}

const isBudgetNote = (note?: string) => note === BUDGET_MESSAGE

const TIER_ORDER: Record<string, number> = { OFFICIAL: 0, EXTERNAL: 1 }

export async function resolveOnline(
  target: ProbeTarget | null,
  sources: OnlineSource[],
  options: TcpOptions & NetworkOptions = {},
  secrets: SourceSecrets = {},
): Promise<OnlineResult> {
  let direct: OnlineResult | undefined
  let skipped = false

  if (target) {
    // One lost packet must not flip a live server to OFFLINE: retry once.
    let result = await probe(target, options)
    if (result.status === 'OFFLINE' && !isBudgetNote(result.note)) result = await probe(target, options)
    if (isBudgetNote(result.note)) skipped = true
    const measured: OnlineResult = { ...result, sourceUrl: null, tier: 'DIRECT', observedAt: result.checkedAt }
    if (result.status !== 'OFFLINE') return measured
    direct = measured
  }

  const available = sources.filter(item => sourceAvailable(item.provider, secrets)).sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9))
  const errors: string[] = []
  let reportedDown: OnlineResult | undefined
  let reportedUp: string | undefined
  for (const source of available) {
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
          ...(direct ? { note: 'Прямая проверка GameScout не прошла; число — по данным источника.' } : {}),
        }
      }
      if (reading.up) reportedUp ??= source.name
      else reportedDown ??= { ...base, status: 'OFFLINE', online: null, maxOnline: null, note: `По данным ${source.name} сервер не отвечает.` }
    } catch (error) {
      if (error instanceof AdapterError && error.code === BUDGET_EXHAUSTED) skipped = true
      errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const now = new Date().toISOString()
  const unknown = (note: string): OnlineResult => ({
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
    note,
    ...(skipped ? { skipped } : {}),
  })

  // A source saying "down" is a basis for OFFLINE — stronger still when our own probe agrees.
  if (reportedDown && !reportedUp) {
    return direct ? { ...reportedDown, note: `Прямая проверка GameScout и ${reportedDown.source} не получили ответа.` } : reportedDown
  }
  if (reportedUp) return unknown(`${reportedUp}: сервер отвечает, но не сообщает число игроков.`)
  // Our own probe failed twice and there is no second opinion to consult: that is the evidence we have.
  if (direct && !available.length) return skipped ? { ...direct, skipped } : direct
  if (direct) {
    return unknown(`Прямая проверка не прошла, а сторонние источники недоступны — оснований для OFFLINE недостаточно. ${errors.join('; ')}`.trim())
  }
  return unknown(errors.length ? `Источники онлайна недоступны: ${errors.join('; ')}` : 'Источник онлайна не подключён')
}
