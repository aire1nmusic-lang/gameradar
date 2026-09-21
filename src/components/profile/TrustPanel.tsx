import { Link } from 'react-router-dom'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, formatSeconds, formatTime } from '@/lib/format'
import type { OnlineData } from '@/models'
import { useTicker } from '@/hooks/useUi'

function Row({ label, value, tone }: { label: string; value: string; tone?: 'signal' | 'warn' | 'danger' }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-[12.5px] text-ink-400">{label}</span>
      <span
        className={cn(
          'text-right font-mono text-[12px]',
          tone === 'signal'
            ? 'text-signal-400'
            : tone === 'warn'
              ? 'text-warn-400'
              : tone === 'danger'
                ? 'text-danger-400'
                : 'text-ink-100',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function TrustPanel({ online, className }: { online: OnlineData; className?: string }) {
  const seconds = useTicker(online.checkedAgoSec, 90)
  const verified = online.status === 'VERIFIED'
  const uptimeTone = online.uptime24h >= 99 ? 'signal' : online.uptime24h >= 90 ? 'warn' : 'danger'

  return (
    <div className={cn('surface rounded-xl p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[14px] font-medium text-ink-50">
          <ShieldCheck size={15} className={verified ? 'text-signal-400' : 'text-ink-400'} />
          Данные GameRadar
        </h3>
        {verified && (
          <span className="flex items-center gap-1.5 rounded-full bg-signal-500/10 px-2 py-0.5 font-mono text-[10.5px] text-signal-300">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
            live
          </span>
        )}
      </div>

      <div className="divide-y divide-white/5">
        <Row label="Источник данных" value={online.source} tone={verified ? 'signal' : undefined} />
        <Row label="Метод" value={online.method} />
        <Row
          label="Последняя проверка"
          value={verified ? `${formatTime(new Date().toISOString())} · ${formatSeconds(seconds)}` : '—'}
        />
        <Row
          label="Успешных проверок за 24 ч"
          value={online.uptime24h ? `${online.uptime24h.toFixed(1).replace('.', ',')}%` : '—'}
          tone={online.uptime24h ? (uptimeTone as 'signal') : undefined}
        />
        <Row label="Частота опроса" value={verified ? '1 раз в 60 сек' : 'не выполняется'} />
        <Row label="Проверок за сутки" value={verified ? formatNumber(online.checksPerDay) : '0'} />
      </div>

      {online.uptime24h > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[10.5px] text-ink-500">
            <span>доступность за 24 часа</span>
            <span className="num">{online.uptime24h.toFixed(1).replace('.', ',')}%</span>
          </div>
          <div className="flex gap-[2px]">
            {Array.from({ length: 48 }).map((_, index) => {
              const failRate = (100 - online.uptime24h) / 100
              const failing = index / 48 > 1 - failRate * 1.6 && failRate > 0.02
              return (
                <span
                  key={index}
                  className={cn(
                    'h-5 flex-1 rounded-[1px]',
                    failing ? 'bg-danger-500/55' : verified ? 'bg-signal-500/45' : 'bg-ink-600',
                  )}
                />
              )
            })}
          </div>
        </div>
      )}

      <Link
        to="/owners#verified"
        className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-ink-400 transition-colors hover:text-ink-100"
      >
        Как GameRadar проверяет онлайн
        <ArrowUpRight size={13} />
      </Link>
    </div>
  )
}
