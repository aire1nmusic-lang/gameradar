import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { getGame } from '@/data/games'
import type { GameServer } from '@/data/types'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { Tag, TrendChip } from '@/components/ui/Badge'
import { LiveDot, VerifiedLine } from '@/components/trust/status'
import { Sparkline } from '@/components/charts/AreaChart'

export function ServerRow({
  server,
  rank,
  showTags = true,
  className,
}: {
  server: GameServer
  rank?: number
  showTags?: boolean
  className?: string
}) {
  const game = getGame(server.gameId)
  const { status, current, change24h } = server.online

  return (
    <Link
      to={`/server/${server.slug}`}
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-3 transition-all duration-200 hover:border-white/14 hover:bg-white/[0.045] sm:gap-4 sm:px-4',
        className,
      )}
    >
      {rank !== undefined && (
        <span className="num w-6 shrink-0 text-center font-display text-[15px] font-semibold text-ink-500 group-hover:text-ink-300">
          {rank}
        </span>
      )}

      <ServerLogo name={server.name} hue={server.hue} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-medium text-ink-50">{server.name}</span>
          <LiveDot status={status} className="shrink-0" />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-400">
          <span className="truncate">
            {game.shortName} · {server.version}
          </span>
        </div>
      </div>

      {showTags && (
        <div className="hidden shrink-0 gap-1.5 xl:flex">
          {server.modes.slice(0, 2).map((mode) => (
            <Tag key={mode}>{mode}</Tag>
          ))}
        </div>
      )}

      <div className="hidden shrink-0 sm:block">
        <Sparkline
          data={server.history['24h']}
          width={64}
          accent={status === 'verified' ? 'var(--color-signal-400)' : 'var(--color-ink-300)'}
        />
      </div>

      <div className="w-[74px] shrink-0 text-right sm:w-[108px]">
        <div className="num text-[15px] font-semibold text-ink-50">{formatNumber(current)}</div>
        <div className="mt-0.5 hidden justify-end sm:flex">
          <VerifiedLine status={status} seconds={server.online.checkedAgoSec} size="xs" />
        </div>
      </div>

      <div className="w-[54px] shrink-0 text-right sm:w-[62px]">
        <TrendChip value={change24h} />
      </div>

      <ChevronRight
        size={16}
        className="hidden shrink-0 text-ink-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-ink-300 sm:block"
      />
    </Link>
  )
}
