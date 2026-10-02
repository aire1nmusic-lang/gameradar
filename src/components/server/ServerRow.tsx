import { Link } from 'react-router-dom'
import { ChevronRight, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCountdown, formatDate, formatPlayers, formatSeconds, plural } from '@/lib/format'
import { chronicleOfVersion, getGame } from '@/data/games'
import { useFavorites } from '@/hooks/useFavorites'
import type { GameServer } from '@/models'
import { OnlineStatus } from '@/models'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { TrendChip } from '@/components/ui/Badge'
import { LiveDot, STATUS_META } from '@/components/trust/status'

/**
 * The default way a server is listed: one dense row, the same everywhere.
 *
 * The same factual fields are visible in every game and on phones.
 */
export function ServerRow({
  server,
  rank,
  className,
  showGame = true,
}: {
  server: GameServer
  rank?: number
  className?: string
  /** hide the game name inside a single-game list */
  showGame?: boolean
}) {
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const { status, change24h, freshness } = server.online
  const launching = !!server.launch && status === OnlineStatus.Pending
  const meta = STATUS_META[status]
  const stale = freshness === 'stale' && status !== OnlineStatus.Offline
  const known = server.online.playersKnown !== false && !launching && status !== OnlineStatus.Unknown && status !== OnlineStatus.Pending
  const tooltip = launching
    ? `Открытие ${formatCountdown(server.launch!.at)}`
    : stale
      ? `Данные устарели · обновлено ${formatSeconds(server.online.observedAgoSec ?? server.online.checkedAgoSec)}`
      : `${meta.caption}${server.online.source ? ` · ${server.online.source}` : ''} · ${formatSeconds(server.online.observedAgoSec ?? server.online.checkedAgoSec)}`
  // Under the number, say whose number it is: GameScout's own check, a named
  // third-party monitor, or the project itself. Phones have no tooltip.
  const sourceLabel =
    status === OnlineStatus.Verified
      ? 'GameScout'
      : status === OnlineStatus.Offline
        ? 'офлайн'
        : !known
          ? 'нет данных'
          : status === OnlineStatus.External
            ? server.online.source || 'внешний'
            : status === OnlineStatus.OwnerReported
              ? server.online.sourceTier === 'OFFICIAL' ? 'сайт проекта' : 'от проекта'
              : server.online.source || 'источник не указан'

  const identity = [showGame ? game.shortName : null, (chronicle?.label ?? server.version) || 'Версия не указана'].filter(Boolean)
  const mode = server.rates ? `Рейты ${server.rates}` : server.modes.length ? server.modes.join(', ') : ''
  const opening = server.openedAt ?? server.launch?.at
  // only what is known: a row full of "не указан" is noise
  const facts = [mode, opening ? `Открытие: ${formatDate(opening)}` : '', server.region || server.country || ''].filter(Boolean)
  const measured = known && freshness === 'fresh'
  const sourceTime = measured ? `${sourceLabel} · ${formatSeconds(server.online.observedAgoSec ?? server.online.checkedAgoSec)}` : sourceLabel

  return (
    <Link
      to={`/server/${server.slug}`}
      className={cn(
        'gs-row group relative flex min-h-[92px] flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition-colors duration-150 hover:border-white/14 hover:bg-white/[0.045] sm:flex-nowrap sm:gap-x-4 sm:px-4',
        className,
      )}
    >
      {rank !== undefined && (
        <span
          className={cn(
            'gs-row-rank num w-6 shrink-0 text-center font-display text-[14px] font-semibold tabular-nums',
            'text-ink-500',
          )}
        >
          {rank}
        </span>
      )}

      <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} src={server.logoUrl} size="sm" />

      <div className="gs-row-identity min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-ink-50">{server.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: game.accent }} />
          <span className="truncate">{identity.join(' · ')}<span className="sm:hidden"> · {server.rates || server.modes.join(', ') || 'Режим не указан'}</span></span>
        </div>
        <div className="mt-0.5 text-[11px] leading-4 text-ink-400 sm:hidden">{opening?`Открытие: ${formatDate(opening)}`:'Открытие не указано'}</div>
        <div className="gs-row-desktop-facts mt-0.5 text-[11px] leading-4 text-ink-500 sm:truncate" title={facts.join(' · ')}>{facts.join(' · ')}</div>
        {server.support&&<div className="gs-row-support mt-1 text-[11px] text-ink-400">Поддержка: {server.support.coins} · {server.support.participants} {plural(server.support.participants, ['участник', 'участника', 'участников'])}</div>}
      </div>

      {known && Math.abs(change24h) >= 10 && status !== OnlineStatus.Offline && (
        // Wrapped: TrendChip's own inline-flex would override a `hidden` passed to it, and phones need the room for the name.
        <span className="hidden shrink-0 sm:inline-flex">
          <TrendChip value={change24h} />
        </span>
      )}

      <div className="gs-row-online w-full shrink-0 border-t border-white/5 pt-2 text-left sm:w-[150px] sm:border-0 sm:pt-0 sm:text-right" title={tooltip}>
        {launching ? (
          <>
            <div className="num text-[13px] font-semibold text-promo-200">{formatCountdown(server.launch!.at)}</div>
            <div className="mt-0.5 text-[10.5px] text-ink-500">открытие</div>
          </>
        ) : (
          <>
            <div
              className={cn(
                'num flex items-center justify-between text-[17px] leading-none font-semibold tabular-nums sm:block',
                status === OnlineStatus.Offline ? 'text-ink-500' : known ? 'text-ink-50' : 'text-ink-500',
              )}
            >
              <span className="hidden sm:inline">{measured ? formatPlayers(server.online) : 'Онлайн не указан'}</span>
              <span className="sm:hidden text-[13px]">{measured&&status===OnlineStatus.Verified?formatPlayers(server.online):'Онлайн не указан'}{measured&&status===OnlineStatus.Verified&&<small className="mt-1 block text-[10px] font-normal text-ink-400">{sourceTime}</small>}</span>
              <span className="ml-2 shrink-0 font-sans text-[11px] font-normal text-ink-400 sm:hidden">Подробнее →</span>
            </div>
            <div className="gs-row-source mt-1 flex min-w-0 items-center gap-1.5 text-[10.5px] sm:justify-end">
              <LiveDot status={status} stale={stale} className="shrink-0" />
              <span className={cn('truncate', stale ? 'text-warn-400/85' : status === OnlineStatus.Verified ? 'text-signal-300' : 'text-ink-500')}>
                {stale ? 'устарело' : sourceTime}
              </span>
            </div>
          </>
        )}
      </div>

      <RowFavorite slug={server.slug} />

      <span className="hidden shrink-0 text-[11px] text-ink-400 sm:block">Подробнее</span>

      <ChevronRight
        size={16}
        className="hidden shrink-0 text-ink-600 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-ink-300 sm:block"
      />
    </Link>
  )
}

function RowFavorite({ slug }: { slug: string }) {
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
        'gs-row-favorite relative z-[2] grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors',
        active ? 'text-danger-400' : 'text-ink-600 hover:bg-white/6 hover:text-ink-200',
      )}
    >
      <Heart size={15} fill={active ? 'currentColor' : 'none'} />
    </button>
  )
}

export function ServerRowSkeleton() {
  return (
    <div className="flex min-h-[64px] items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4">
      <div className="skeleton h-10 w-10 rounded-md" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3.5 w-1/3 rounded" />
        <div className="skeleton h-3 w-1/4 rounded" />
      </div>
      <div className="skeleton h-5 w-16 rounded" />
    </div>
  )
}

/** A stack of rows with the standard spacing. */
export function ServerList({ servers, from = 1, ranked, showGame, className }: { servers: GameServer[]; from?: number; ranked?: boolean; showGame?: boolean; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {servers.map((server, index) => (
        <ServerRow key={server.slug} server={server} rank={ranked ? from + index : undefined} showGame={showGame} />
      ))}
    </div>
  )
}
