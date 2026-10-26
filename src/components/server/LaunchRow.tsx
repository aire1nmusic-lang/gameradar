import { artSrc, worldArt } from '@/data/themeMedia'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatLaunch } from '@/lib/format'
import { chronicleOfVersion, getGame } from '@/data/games'
import type { GameServer } from '@/models'
import { WorldIcon } from '@/components/icons/WorldIcon'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { LaunchCountdown } from './LaunchCountdown'

/**
 * An announced opening as one row: what opens and when. (No reminder button until reminders really exist.)
 * No online fields — there is nothing to measure before the start.
 */
export function LaunchRow({ server, className, showGame = true }: { server: GameServer; className?: string; showGame?: boolean }) {
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const art = worldArt('hero',server.gameId)
  const launch = server.launch
  if (!launch) return null
  const sub = [showGame ? game.shortName : null, chronicle?.label ?? server.version, server.rates ? `рейты ${server.rates}` : null].filter(Boolean)

  return (
    <Link
      to={`/server/${server.slug}`}
      className={cn(
        'gs-opening-card gs-row-line group flex min-h-[54px] items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 transition-colors duration-150 hover:border-white/14 hover:bg-white/[0.045] sm:min-h-[54px] sm:gap-4 sm:px-4',
        className,
      )}
    >
      {art&&<img className="gs-opening-art" src={artSrc(art,800)} alt="" aria-hidden="true"/>}
      <span className="gs-opening-date"><b>{new Date(launch.at).toLocaleDateString('ru-RU',{day:'2-digit',timeZone:'Europe/Moscow'})}</b>{new Date(launch.at).toLocaleDateString('ru-RU',{month:'short',timeZone:'Europe/Moscow'})}</span>
      <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} src={server.logoUrl} size="sm" forceGameGlyph className="gs-row-avatar" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-ink-50">{server.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: game.accent }} />
          <span className="truncate">{sub.join(' · ')}</span>
        </div>
      </div>
      <div className="shrink-0 text-right" title={formatLaunch(launch.at)}>
        <div className={cn('num inline-flex items-center gap-1.5 text-[12px] font-semibold tabular-nums sm:text-[13px]', 'text-ink-100')}>
          <WorldIcon name="opening" size={13} className="hidden text-ink-500 sm:block" />
          <LaunchCountdown at={launch.at}/>
        </div>
        <div className="mt-0.5 hidden text-[11px] text-ink-500 sm:block">{formatLaunch(launch.at)}</div>
      </div>
      <ChevronRight size={16} className="hidden shrink-0 text-ink-600 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-ink-300 sm:block" />
    </Link>
  )
}
