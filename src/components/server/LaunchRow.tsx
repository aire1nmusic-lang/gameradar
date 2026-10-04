import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCountdown, formatLaunch } from '@/lib/format'
import { chronicleOfVersion, getGame } from '@/data/games'
import type { GameServer } from '@/models'
import { ServerLogo } from '@/components/ui/ServerLogo'

/**
 * An announced opening as one row: what opens and when. (No reminder button until reminders really exist.)
 * No online fields — there is nothing to measure before the start.
 */
export function LaunchRow({ server, className, showGame = true }: { server: GameServer; className?: string; showGame?: boolean }) {
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const launch = server.launch
  if (!launch) return null
  const sub = [showGame ? game.shortName : null, chronicle?.label ?? server.version, server.rates ? `рейты ${server.rates}` : null].filter(Boolean)

  return (
    <Link
      to={`/server/${server.slug}`}
      className={cn(
        'group flex min-h-[64px] items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 transition-colors duration-150 hover:border-white/14 hover:bg-white/[0.045] sm:min-h-[60px] sm:gap-4 sm:px-4',
        className,
      )}
    >
      <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} src={server.logoUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-ink-50">{server.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: game.accent }} />
          <span className="truncate">{sub.join(' · ')}</span>
        </div>
      </div>
      <div className="shrink-0 text-right" title={formatLaunch(launch.at)}>
        <div className={cn('num inline-flex items-center gap-1.5 text-[12px] font-semibold tabular-nums sm:text-[13px]', 'text-ink-100')}>
          <CalendarClock size={13} className="hidden text-ink-500 sm:block" />
          {formatCountdown(launch.at)}
        </div>
        <div className="mt-0.5 hidden text-[11px] text-ink-500 sm:block">{formatLaunch(launch.at)}</div>
      </div>
      <ChevronRight size={16} className="hidden shrink-0 text-ink-600 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-ink-300 sm:block" />
    </Link>
  )
}
