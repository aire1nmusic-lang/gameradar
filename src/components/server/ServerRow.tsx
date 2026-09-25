import { Link } from 'react-router-dom'
import { ChevronRight, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCountdown, formatPlayers, formatSeconds } from '@/lib/format'
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
 * Hierarchy: name → online now → game · chronicle · modes → trust dot.
 * Everything about *where* the number came from lives in the tooltip and on
 * the profile; the row itself stays quiet so many rows can be compared.
 *
 * 64 px on desktop, 72 px on phones: 10+ servers fit one screen.
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

  const identity = [showGame ? game.shortName : null, chronicle?.label ?? server.version].filter(Boolean)
  // Phones get the identity only; modes need the room a desktop row has.
  const sub = [...identity, ...server.modes.slice(0, 2)]

  return (
    <Link
      to={`/server/${server.slug}`}
      className={cn(
        'group relative flex min-h-[72px] items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 transition-colors duration-150 hover:border-white/14 hover:bg-white/[0.045] sm:min-h-[64px] sm:gap-4 sm:px-4',
        className,
      )}
    >
      {rank !== undefined && (
        <span
          className={cn(
            'num w-6 shrink-0 text-center font-display text-[14px] font-semibold tabular-nums',
            rank <= 3 ? 'text-ink-50' : 'text-ink-500',
          )}
        >
          {rank}
        </span>
      )}

      <ServerLogo name={server.name} hue={server.hue} src={server.logoUrl} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-ink-50">{server.name}</span>
          {server.promo && (
            <span className="hidden shrink-0 rounded-sm border border-promo-500/30 px-1.5 py-px text-[9.5px] font-semibold tracking-[0.08em] text-promo-200 uppercase sm:inline">
              {server.promo === 'VIP' ? 'VIP' : 'TOP'}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: game.accent }} />
          <span className="truncate sm:hidden">{identity.join(' · ')}</span>
          <span className="hidden truncate sm:inline">{sub.join(' · ')}</span>
        </div>
      </div>

      <span className="hidden w-[52px] shrink-0 text-[12px] text-ink-500 lg:block" title={[server.country, server.region].filter(Boolean).join(' · ')}>
        {server.flag} {server.region}
      </span>

      {known && Math.abs(change24h) >= 10 && status !== OnlineStatus.Offline && (
        <TrendChip value={change24h} className="hidden shrink-0 sm:inline-flex" />
      )}

      <div className="w-[86px] shrink-0 text-right sm:w-[104px]" title={tooltip}>
        {launching ? (
          <>
            <div className="num text-[13px] font-semibold text-promo-200">{formatCountdown(server.launch!.at)}</div>
            <div className="mt-0.5 text-[10.5px] text-ink-500">открытие</div>
          </>
        ) : (
          <>
            <div
              className={cn(
                'num text-[17px] leading-none font-semibold tabular-nums',
                status === OnlineStatus.Offline ? 'text-ink-500' : known ? 'text-ink-50' : 'text-ink-500',
              )}
            >
              {known ? formatPlayers(server.online) : '—'}
            </div>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-[10.5px]">
              <LiveDot status={status} />
              <span className={cn(stale ? 'text-warn-400/85' : status === OnlineStatus.Verified ? 'text-signal-300' : 'text-ink-500')}>
                {stale ? 'устарело' : status === OnlineStatus.Verified ? 'проверено' : status === OnlineStatus.Offline ? 'офлайн' : known ? 'онлайн' : 'нет данных'}
              </span>
            </div>
          </>
        )}
      </div>

      <RowFavorite slug={server.slug} />

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
        'relative z-[2] hidden h-8 w-8 shrink-0 place-items-center rounded-md transition-colors sm:grid',
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
