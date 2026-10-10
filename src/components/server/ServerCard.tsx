import { Link } from 'react-router-dom'
import { ArrowRight, Heart, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatNumber, formatPlayers, formatRating, formatSlots, plural } from '@/lib/format'
import { getGame } from '@/data/games'
import type { GameServer } from '@/models'
import { useFavorites } from '@/hooks/useFavorites'
import { serverArt } from '@/data/themeMedia'
import { themeForGame } from '@/data/themes'
import { ThemeScope } from '@/theme'
import { ArtImage } from '@/components/media/WorldArt'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { Tag, TrendChip } from '@/components/ui/Badge'
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

/** Opening date is never inferred from when a card was added or wiped. */
function lifecycleLabel(server: GameServer): string {
  return server.openedAt ? `Открытие: ${formatDate(server.openedAt)}` : server.launch?.at ? `Открытие: ${formatDate(server.launch.at)}` : 'Дата открытия не указана'
}

export function ServerCard({ server, className }: { server: GameServer; className?: string }) {
  const game = getGame(server.gameId)
  const { status, current, max, change24h } = server.online
  const measured = server.online.playersKnown === true && server.online.freshness === 'fresh'
  const capacity = measured && server.online.maxKnown && max > 0 ? Math.min(100, (current / max) * 100) : null
  const art = serverArt(server)

  return (
    <ThemeScope theme={themeForGame(server.gameId)} as="div" className="contents">
    <Link
      to={`/server/${server.slug}`}
      className={cn(
        'gs-server-card surface interactive group relative isolate flex h-full flex-col overflow-hidden rounded-xl p-4',
        className,
      )}
    >
      {/*
        Dense info card: the world art is a corner bloom only. It is masked
        into the top-right — away from the name, the description and the
        trust line — so no text ever loses contrast against bright artwork.
      */}
      {art && (
        <span aria-hidden className="gs-server-card-art pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <ArtImage
            art={art}
            sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
            width={400}
            className="opacity-[0.22] transition-opacity duration-500 group-hover:opacity-[0.32]"
          />
          <span
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(200deg, color-mix(in oklab, var(--color-ink-900) 25%, transparent) 0%, var(--color-ink-900) 58%)',
              maskImage:
                'radial-gradient(135% 115% at 100% 0%, transparent 0%, rgba(0,0,0,0.45) 34%, #000 66%)',
              WebkitMaskImage:
                'radial-gradient(135% 115% at 100% 0%, transparent 0%, rgba(0,0,0,0.45) 34%, #000 66%)',
            }}
          />
        </span>
      )}


      <div className="flex items-start gap-3">
        <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} kind={server.chronicleId} src={server.logoUrl} size="md" />
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
              {game.shortName} · {server.version || 'Версия не указана'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2">
        <StatusBadge status={status} size="sm" launching={!!server.launch} />
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                'num font-display text-[26px] leading-none font-semibold tracking-tight',
                status === 'OFFLINE' ? 'text-ink-500' : 'text-ink-50',
              )}
            >
              {measured ? formatPlayers(server.online) : 'Онлайн не указан'}
            </span>
            {measured && server.online.maxKnown && <span className="num text-[13px] text-ink-500">/ {formatSlots(server.online)}</span>}
          </div>
          <div className="mt-1.5">
            <VerifiedLine online={server.online} launching={!!server.launch} size="xs" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {measured && server.online.checksPerDay > 0 && <TrendChip value={change24h} />}
          {server.history['24h'].length > 1 && (
            <Sparkline
              data={server.history['24h']}
              accent={
                status === 'VERIFIED'
                  ? 'var(--color-signal-400)'
                  : status === 'OFFLINE'
                    ? 'var(--color-danger-400)'
                    : 'var(--color-ink-300)'
              }
            />
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-400">
        <span>{server.rates ? `Рейты: ${server.rates}` : server.modes.length ? `Режим: ${server.modes.join(', ')}` : 'Режим не указан'}</span>
        <span>{server.region || 'Регион не указан'}</span>
      </div>
      {server.support&&server.support.coins>0&&<div className="mt-1 text-[12px] text-ink-400">Поддержка: {server.support.coins} · {server.support.participants} {plural(server.support.participants, ['участник', 'участника', 'участников'])}</div>}

      {capacity !== null && <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/6">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            status === 'VERIFIED' ? 'bg-signal-500/70' : status === 'OFFLINE' ? 'bg-danger-500/50' : 'bg-ink-400/60',
          )}
          style={{ width: `${capacity}%` }}
        />
      </div>}

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {server.tags.slice(0, 3).map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>

      <p className="clamp-2 mt-3 min-h-[40px] text-[13px] leading-[1.55] text-ink-300">{server.summary || 'Описание проекта не добавлено.'}</p>

      <div className="mt-auto pt-3.5">
        <div className="flex items-center justify-between gap-2 border-t border-white/6 pt-3 text-[12px] text-ink-400">
          <span className="flex min-w-0 items-center gap-1.5">
            <span>{server.flag}</span>
            <span className="truncate">{server.region || server.country || 'Регион не указан'}</span>
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
    </ThemeScope>
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
