import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, Timer, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompact, formatCountdown, formatLaunch } from '@/lib/format'
import { getGame } from '@/data/games'
import { serverArt } from '@/data/themeMedia'
import { themeForGame } from '@/data/themes'
import { ThemeScope } from '@/theme'
import { WorldArtSurface } from '@/components/media/WorldArt'
import type { GameServer } from '@/models'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { PromoLabel, TrendChip } from '@/components/ui/Badge'

export function LaunchCard({
  server,
  className,
  fluid,
}: {
  server: GameServer
  className?: string
  fluid?: boolean
}) {
  const game = getGame(server.gameId)
  const launch = server.launch
  const art = serverArt(server)
  if (!launch) return null

  const soon = new Date(launch.at).getTime() - Date.now() < 12 * 3_600_000

  return (
    <ThemeScope theme={themeForGame(server.gameId)} as="div" className="contents">
    <Link
      to={`/server/${server.slug}`}
      className={cn(
        'surface interactive group relative flex flex-col overflow-hidden rounded-xl',
        fluid ? 'w-full' : 'w-[300px] sm:w-[340px]',
        className,
      )}
    >
      <div
        className="relative h-[104px] overflow-hidden"
        style={art ? undefined : { background: `linear-gradient(120deg, ${game.from}, ${game.to})` }}
      >
        {art ? (
          <WorldArtSurface art={art} scrim="tile" zoom width={400} sizes="340px" />
        ) : (
          <>
            <div className="absolute inset-0 texture-lines opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/25 to-transparent" />
          </>
        )}

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] backdrop-blur-sm',
              soon
                ? 'border-white/25 bg-ink-1000/55 text-white'
                : 'border-white/15 bg-ink-1000/45 text-white/80',
            )}
          >
            <Timer size={11} />
            {formatCountdown(launch.at)}
          </span>
        </div>

        {launch.promoted && <PromoLabel kind="FEATURED" className="absolute top-3 right-3 backdrop-blur-sm" />}

        <div className="absolute -bottom-5 left-4">
          <ServerLogo name={server.name} hue={server.hue} size="md" className="ring-4 ring-ink-850" />
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pt-7 pb-4">
        <h3 className="truncate text-[16px] font-semibold text-ink-50">{server.name}</h3>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-400">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: game.accent }} />
          {game.shortName} · {server.version}
        </div>

        <div className="mt-3 text-[12.5px] text-ink-300">{launch.type}</div>

        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-white/6 bg-white/[0.025] p-3">
          <div>
            <div className="text-[10.5px] tracking-[0.08em] text-ink-500 uppercase">Открытие</div>
            <div className="mt-1 text-[13px] font-medium text-ink-50">{formatLaunch(launch.at)}</div>
          </div>
          <div>
            <div className="text-[10.5px] tracking-[0.08em] text-ink-500 uppercase">Интерес</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="num flex items-center gap-1 text-[13px] font-medium text-ink-50">
                <Users size={12} className="text-ink-400" />
                {formatCompact(launch.preRegistrations)}
              </span>
              <TrendChip value={launch.interestChange} />
            </div>
          </div>
        </div>

        <p className="clamp-2 mt-3 text-[13px] leading-[1.5] text-ink-300">{server.summary}</p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-100 transition-colors group-hover:text-white">
            Посмотреть сервер
            <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-white/8 px-2 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-white/18 hover:text-ink-100"
            title="Напомнить об открытии"
          >
            <BellRing size={12} />
            Напомнить
          </span>
        </div>
      </div>
    </Link>
    </ThemeScope>
  )
}
