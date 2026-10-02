import { Link } from 'react-router-dom'
import { ChevronRight, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCountdown, formatPlayers, formatSeconds, plural } from '@/lib/format'
import { chronicleOfVersion, getGame } from '@/data/games'
import { useFavorites } from '@/hooks/useFavorites'
import type { GameServer } from '@/models'
import { OnlineStatus } from '@/models'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { RankMedal, MEDAL } from '@/components/ui/RankMedal'
import { TrendChip } from '@/components/ui/Badge'
import { LiveDot, STATUS_META } from '@/components/trust/status'

export type RowMetric = 'auto' | 'support'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })

/** What a server's number means and whose number it is: GameScout's own check, a named monitor or the project itself. */
function describeOnline(server: GameServer) {
  const { status, freshness } = server.online
  const launching = !!server.launch && status === OnlineStatus.Pending
  const known = server.online.playersKnown !== false && !launching && status !== OnlineStatus.Unknown && status !== OnlineStatus.Pending
  const stale = freshness === 'stale' && status !== OnlineStatus.Offline
  const measured = known && freshness === 'fresh'
  const source =
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
  return { status, launching, known, stale, measured, source }
}

/**
 * The default way a server is listed: one neat line, the same everywhere.
 * Name, chronicle · rates · opening, and the number that decides — with its source.
 */
export function ServerRow({
  server,
  rank,
  className,
  showGame = true,
  metric = 'auto',
  compact = false,
}: {
  server: GameServer
  rank?: number
  className?: string
  /** hide the game name inside a single-game list */
  showGame?: boolean
  metric?: RowMetric
  /** inside a narrow panel: no heart and no arrow, the name gets the room */
  compact?: boolean
}) {
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const { status, change24h } = server.online
  const { launching, known, stale, measured, source } = describeOnline(server)
  const meta = STATUS_META[status]
  const opening = server.openedAt ?? server.launch?.at
  const identity = [
    showGame ? game.shortName : null,
    chronicle?.label ?? (server.version || null),
    server.rates ? `x${String(server.rates).replace(/^x/i, '')}` : server.modes.slice(0, 2).join(', ') || null,
    opening && !launching ? `с ${shortDate(opening)}` : null,
  ].filter(Boolean)
  const medal = rank !== undefined ? MEDAL[rank] : undefined
  const support = server.support?.coins ?? 0
  const tooltip = launching
    ? `Открытие ${formatCountdown(server.launch!.at)}`
    : stale
      ? `Данные устарели · обновлено ${formatSeconds(server.online.observedAgoSec ?? server.online.checkedAgoSec)}`
      : `${meta.caption}${server.online.source ? ` · ${server.online.source}` : ''} · ${formatSeconds(server.online.observedAgoSec ?? server.online.checkedAgoSec)}`

  return (
    <Link
      to={`/server/${server.slug}`}
      title={tooltip}
      className={cn(
        'gs-row group relative flex min-h-[58px] items-center gap-2.5 rounded-xl border bg-white/[0.035] px-2.5 py-2 transition-colors duration-150 hover:bg-white/[0.07] sm:gap-3 sm:px-3',
        medal ? '' : 'border-white/[0.09] hover:border-white/20',
        className,
      )}
      style={medal ? { borderColor: medal.ring, background: `linear-gradient(90deg, ${medal.ring.replace(/[\d.]+\)$/, '.10)')}, rgba(255,255,255,.03) 55%)` } : undefined}
    >
      {rank !== undefined && <RankMedal rank={rank} className="h-6 w-6 text-[12px] sm:h-7 sm:w-7 sm:text-[13px]" />}

      <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} kind={server.chronicleId ?? chronicle?.id} src={server.logoUrl} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] leading-5 font-semibold text-ink-50">{server.name}</span>
          {known && Math.abs(change24h) >= 10 && status !== OnlineStatus.Offline && (
            <span className="hidden shrink-0 sm:inline-flex"><TrendChip value={change24h} /></span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-ink-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: game.accent }} />
          <span className="truncate">{identity.join(' · ')}</span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        {metric === 'support' ? (
          <>
            <div className="num text-[16px] leading-5 font-semibold text-ink-50">{support > 0 ? support : server.votes}</div>
            <div className="mt-0.5 text-[10.5px] leading-4 text-ink-500">
              {support > 0 ? `${server.support?.participants ?? 0} ${plural(server.support?.participants ?? 0, ['участник', 'участника', 'участников'])}` : 'голосов'}
            </div>
          </>
        ) : launching ? (
          <>
            <div className="num text-[14px] leading-5 font-semibold whitespace-nowrap text-promo-200">{formatCountdown(server.launch!.at)}</div>
            <div className="mt-0.5 text-[10.5px] leading-4 text-ink-500">{shortDate(server.launch!.at)}</div>
          </>
        ) : (
          <>
            <div className={cn('num text-[16px] leading-5 font-semibold tabular-nums', status === OnlineStatus.Offline ? 'text-ink-500' : measured ? 'text-ink-50' : 'text-ink-500')}>
              {measured ? formatPlayers(server.online) : '—'}
            </div>
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] leading-4">
              <LiveDot status={status} stale={stale} className="shrink-0" />
              <span className={cn('max-w-[92px] truncate sm:max-w-[130px]', stale ? 'text-warn-400/85' : status === OnlineStatus.Verified ? 'text-signal-300' : 'text-ink-500')}>
                {stale ? 'устарело' : measured ? `${source}` : source}
              </span>
            </div>
          </>
        )}
      </div>

      {!compact && <RowFavorite slug={server.slug} />}
      {!compact && <ChevronRight size={16} className="hidden shrink-0 text-ink-600 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-ink-300 sm:block" />}
    </Link>
  )
}

/** The same server as a compact tile — for the "плитки" view. No picture: the icon and the number carry it. */
export function ServerTile({ server, rank, showGame = false }: { server: GameServer; rank?: number; showGame?: boolean }) {
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const { status, change24h } = server.online
  const { launching, known, stale, measured, source } = describeOnline(server)
  const medal = rank !== undefined ? MEDAL[rank] : undefined
  const sub = [showGame ? game.shortName : null, chronicle?.label ?? (server.version || null), server.rates ? `x${String(server.rates).replace(/^x/i, '')}` : server.modes[0] || null].filter(Boolean)
  return (
    <Link
      to={`/server/${server.slug}`}
      className={cn('group flex min-w-0 flex-col gap-2 rounded-xl border bg-white/[0.035] p-3 transition-colors hover:bg-white/[0.07]', medal ? '' : 'border-white/[0.09] hover:border-white/20')}
      style={medal ? { borderColor: medal.ring } : undefined}
    >
      <div className="flex items-center gap-2.5">
        {rank !== undefined && <RankMedal rank={rank} className="h-6 w-6 text-[12px]" />}
        <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} kind={server.chronicleId ?? chronicle?.id} src={server.logoUrl} size="xs" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] leading-5 font-semibold text-ink-50">{server.name}</div>
          <div className="truncate text-[11.5px] leading-4 text-ink-400">{sub.join(' · ')}</div>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        {launching ? (
          <div className="num text-[15px] font-semibold whitespace-nowrap text-promo-200">{formatCountdown(server.launch!.at)}</div>
        ) : (
          <div className={cn('num text-[20px] leading-none font-semibold tabular-nums', measured ? 'text-ink-50' : 'text-ink-500')}>{measured ? formatPlayers(server.online) : '—'}</div>
        )}
        <div className="flex min-w-0 items-center gap-1 text-[10.5px] text-ink-500">
          {known && measured && Math.abs(change24h) >= 10 && <TrendChip value={change24h} />}
          {!launching && <><LiveDot status={status} stale={stale} className="shrink-0" /><span className="max-w-[70px] truncate">{measured ? source : 'нет данных'}</span></>}
        </div>
      </div>
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
        'gs-row-favorite relative z-[2] hidden h-8 w-8 shrink-0 place-items-center rounded-md transition-colors sm:grid',
        active ? 'text-danger-400' : 'text-ink-600 hover:bg-white/6 hover:text-ink-200',
      )}
    >
      <Heart size={15} fill={active ? 'currentColor' : 'none'} />
    </button>
  )
}

export function ServerRowSkeleton() {
  return (
    <div className="flex min-h-[58px] items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3">
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
export function ServerList({ servers, from = 1, ranked, showGame, metric, className }: { servers: GameServer[]; from?: number; ranked?: boolean; showGame?: boolean; metric?: RowMetric; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {servers.map((server, index) => (
        <ServerRow key={server.slug} server={server} rank={ranked ? from + index : undefined} showGame={showGame} metric={metric} />
      ))}
    </div>
  )
}

/** Tiles: two columns on a phone, three on a desktop. */
export function ServerTiles({ servers, from = 1, ranked, showGame }: { servers: GameServer[]; from?: number; ranked?: boolean; showGame?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      {servers.map((server, index) => (
        <ServerTile key={server.slug} server={server} rank={ranked ? from + index : undefined} showGame={showGame} />
      ))}
    </div>
  )
}
