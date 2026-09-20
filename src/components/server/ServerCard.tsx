import { Link } from 'react-router-dom'
import { ArrowRight, Heart, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatAge, formatCountdown, formatNumber, formatRating } from '@/lib/format'
import { getGame } from '@/data/games'
import type { GameServer } from '@/data/types'
import { useFavorites } from '@/hooks/useFavorites'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { PromoLabel, Tag, TrendChip } from '@/components/ui/Badge'
import { StatusBadge, VerifiedLine } from '@/components/trust/status'
import { Sparkline } from '@/components/charts/AreaChart'

export function FavoriteButton({ slug, className }: { slug: string; className?: string }) {
  const { has, toggle } = useFavorites()
  const active = has(slug)
  return (
    <button
      type="button"
      aria-label={active ? 'Убрать из избранного' : 'В избранное'}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggle(slug)
      }}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-md border border-transparent text-ink-500 transition-all duration-200 hover:border-white/10 hover:bg-white/6 hover:text-ink-100',
        active && 'text-danger-400 hover:text-danger-300',
        className,
      )}
    >
      <Heart size={15} fill={active ? 'currentColor' : 'none'} />
    </button>
  )
}

/** The single most useful date for this server right now: launch, wipe, or age. */
function lifecycleLabel(server: GameServer): string {
  if (server.launch) return `Старт ${formatCountdown(server.launch.at)}`
  if (server.nextWipeAt) {
    const days = Math.ceil((new Date(server.nextWipeAt).getTime() - Date.now()) / 86_400_000)
    if (days >= 0 && days <= 14) return days === 0 ? 'Вайп сегодня' : `Вайп через ${days} дн.`
  }
  return `Открыт ${formatAge(server.openedAt)}`
}

export function ServerCard({ server, className }: { server: GameServer; className?: string }) {
  const game = getGame(server.gameId)
  const { status, current, max, change24h } = server.online
  const capacity = max > 0 ? Math.min(100, (current / max) * 100) : 0
  const isVip = server.promo === 'vip'

  return (
    <Link
      to={`/server/${server.slug}`}
      className={cn(
        'surface interactive group relative flex h-full flex-col rounded-xl p-4',
        isVip && 'border-promo-500/25 bg-promo-900/20',
        className,
      )}
    >
      {isVip && (
        <span className="pointer-events-none absolute inset-x-0 -top-px mx-4 h-px bg-gradient-to-r from-transparent via-promo-400/60 to-transparent" />
      )}

      <div className="flex items-start gap-3">
        <ServerLogo name={server.name} hue={server.hue} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[16px] leading-6 font-semibold text-ink-50 transition-colors group-hover:text-white">
              {server.name}
            </h3>
            <FavoriteButton slug={server.slug} className="-mt-1 -mr-1" />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-400">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: game.accent }} />
            <span className="truncate">
              {game.shortName} · {server.version}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2">
        <StatusBadge status={status} size="sm" />
        {server.promo && server.promo !== 'vip' && <PromoLabel kind={server.promo} />}
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                'num font-display text-[26px] leading-none font-semibold tracking-tight',
                status === 'offline' ? 'text-ink-500' : 'text-ink-50',
              )}
            >
              {status === 'pending' ? '—' : formatNumber(current)}
            </span>
            <span className="num text-[13px] text-ink-500">/ {formatNumber(max)}</span>
          </div>
          <div className="mt-1.5">
            <VerifiedLine status={status} seconds={server.online.checkedAgoSec} source={server.online.source} size="xs" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {status !== 'pending' && status !== 'offline' && <TrendChip value={change24h} />}
          {server.history['24h'].length > 1 && (
            <Sparkline
              data={server.history['24h']}
              accent={
                status === 'verified'
                  ? 'var(--color-signal-400)'
                  : status === 'offline'
                    ? 'var(--color-danger-400)'
                    : 'var(--color-ink-300)'
              }
            />
          )}
        </div>
      </div>

      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/6">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            status === 'verified' ? 'bg-signal-500/70' : status === 'offline' ? 'bg-danger-500/50' : 'bg-ink-400/60',
          )}
          style={{ width: `${capacity}%` }}
        />
      </div>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {server.tags.slice(0, 3).map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>

      <p className="clamp-2 mt-3 min-h-[40px] text-[13px] leading-[1.55] text-ink-300">{server.summary}</p>

      <div className="mt-auto pt-3.5">
        <div className="flex items-center justify-between gap-2 border-t border-white/6 pt-3 text-[12px] text-ink-400">
          <span className="flex min-w-0 items-center gap-1.5">
            <span>{server.flag}</span>
            <span className="truncate">{server.region}</span>
            <span className="text-ink-600">·</span>
            <span className="truncate">{lifecycleLabel(server)}</span>
          </span>
          <span className="shrink-0">
            {server.rating > 0 ? (
              <span className="num flex items-center gap-1 text-ink-200">
                <svg width="11" height="11" viewBox="0 0 20 20" className="text-warn-400" aria-hidden>
                  <path
                    d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.21l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z"
                    fill="currentColor"
                  />
                </svg>
                {formatRating(server.rating)}
                <span className="text-ink-500">({formatNumber(server.reviewsCount)})</span>
              </span>
            ) : (
              <span className="num flex items-center gap-1">
                <Users size={11} /> {formatNumber(server.favorites)}
              </span>
            )}
          </span>
        </div>

        <span className="mt-2.5 flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/7 bg-white/[0.035] text-[13px] font-medium text-ink-200 transition-colors duration-200 group-hover:border-white/16 group-hover:bg-white/[0.08] group-hover:text-ink-50">
          Подробнее
          <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

export function ServerCardSkeleton() {
  return (
    <div className="surface flex h-full flex-col rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="skeleton h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-4 w-1/2 rounded" />
          <div className="skeleton h-3 w-1/3 rounded" />
        </div>
      </div>
      <div className="skeleton mt-4 h-5 w-32 rounded-full" />
      <div className="skeleton mt-3 h-7 w-28 rounded" />
      <div className="skeleton mt-3 h-[3px] w-full rounded-full" />
      <div className="mt-4 flex gap-1.5">
        <div className="skeleton h-6 w-16 rounded-sm" />
        <div className="skeleton h-6 w-20 rounded-sm" />
        <div className="skeleton h-6 w-14 rounded-sm" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-4/5 rounded" />
      </div>
      <div className="skeleton mt-5 h-3 w-1/2 rounded" />
    </div>
  )
}
