import { Link } from 'react-router-dom'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, formatSeconds } from '@/lib/format'
import type { OnlineData } from '@/models'
import { probeLabel } from '@/services/monitoringService'
import { useTicker } from '@/hooks/useUi'

function Row({ label, value, tone, href }: { label: string; value: string; tone?: 'signal' | 'warn' | 'danger'; href?: string }) {
  const className = cn(
    'min-w-0 shrink-0 [overflow-wrap:anywhere] text-right font-mono text-[12px]',
    tone === 'signal' ? 'text-signal-400' : tone === 'warn' ? 'text-warn-400' : tone === 'danger' ? 'text-danger-400' : 'text-ink-100',
  )
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="min-w-0 max-w-[55%] flex-1 text-[12.5px] leading-snug text-ink-400">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cn(className, 'underline decoration-white/20 underline-offset-2 hover:decoration-white/60')}>
          {value}
        </a>
      ) : (
        <span className={className}>{value}</span>
      )}
    </div>
  )
}

const TIER_LABEL: Record<string, string> = {
  DIRECT: 'Проверка GameScout',
  OFFICIAL: 'Сайт проекта',
  EXTERNAL: 'Сторонний мониторинг',
}

const FRESHNESS_LABEL: Record<string, [string, 'signal' | 'warn' | undefined]> = {
  fresh: ['актуальные', 'signal'],
  stale: ['устарели', 'warn'],
  unknown: ['нет данных', undefined],
}

/**
 * Where the online number comes from, how old it is and how often it is
 * checked — every row is a stored fact, nothing is simulated.
 */
export function TrustPanel({ online, className }: { online: OnlineData; className?: string }) {
  const measured = online.status !== 'PENDING' && !!online.checkedAgoSec
  const seconds = useTicker(online.checkedAgoSec, 90)
  const verified = online.status === 'VERIFIED'
  const uptimeTone = online.uptime24h >= 99 ? 'signal' : online.uptime24h >= 90 ? 'warn' : 'danger'
  const [freshness, freshnessTone] = FRESHNESS_LABEL[online.freshness ?? 'unknown']

  return (
    <div className={cn('surface rounded-xl p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[14px] font-medium text-ink-50">
          <ShieldCheck size={15} className={verified ? 'text-signal-400' : 'text-ink-400'} />
          Данные GameScout
        </h3>
        {verified && online.freshness === 'fresh' && (
          <span className="flex items-center gap-1.5 rounded-full bg-signal-500/10 px-2 py-0.5 font-mono text-[10.5px] text-signal-300">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
            live
          </span>
        )}
      </div>

      <div className="divide-y divide-white/5">
        <Row label="Источник данных" value={measured ? online.source : 'Не подключён'} tone={verified ? 'signal' : undefined} href={online.sourceUrl} />
        <Row label="Тип источника" value={online.sourceTier ? TIER_LABEL[online.sourceTier] : '—'} />
        <Row label="Метод" value={probeLabel(online)} />
        <Row label="Последняя проверка" value={measured ? formatSeconds(seconds) : '—'} />
        <Row label="Актуальность" value={freshness} tone={freshnessTone} />
        <Row
          label="Успешных проверок за 24 ч"
          value={online.uptime24h ? `${online.uptime24h.toFixed(1).replace('.', ',')}%` : '—'}
          tone={online.uptime24h ? (uptimeTone as 'signal') : undefined}
        />
        <Row label="Проверок за сутки" value={online.checksPerDay ? formatNumber(online.checksPerDay) : '0'} />
      </div>

      {online.note && online.status !== 'VERIFIED' && (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-500">{online.note}</p>
      )}

      {online.uptime24h > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[10.5px] text-ink-500">
            <span>доступность за 24 часа</span>
            <span className="num">{online.uptime24h.toFixed(1).replace('.', ',')}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/6">
            <div
              className={cn('h-full rounded-full', verified ? 'bg-signal-500/55' : 'bg-ink-400/60')}
              style={{ width: `${Math.min(100, online.uptime24h)}%` }}
            />
          </div>
        </div>
      )}

      <Link
        to="/owners#verified"
        className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-ink-400 transition-colors hover:text-ink-100"
      >
        Как GameScout проверяет онлайн
        <ArrowUpRight size={13} />
      </Link>
    </div>
  )
}
