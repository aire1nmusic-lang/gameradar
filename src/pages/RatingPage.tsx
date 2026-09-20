import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Info, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, formatRating } from '@/lib/format'
import { GAMES, getGame } from '@/data/games'
import { liveServers } from '@/data/servers'
import type { GameServer } from '@/data/types'
import { Container } from '@/components/layout/Container'
import { ChipToggle } from '@/components/ui/controls'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { TrendChip } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/trust/status'
import { Notice } from '@/components/ui/feedback'
import { Sparkline } from '@/components/charts/AreaChart'

/** Independent score — paid placements never enter this formula. */
function gameRadarScore(server: GameServer): number {
  const online = Math.log10(server.online.current + 10) * 16
  const rating = server.rating * 7
  const reviews = Math.log10(server.reviewsCount + 10) * 5
  const trust = server.online.status === 'verified' ? 16 : server.online.status === 'reported' ? 4 : 0
  const stability = (server.online.uptime24h / 100) * 10
  const growth = Math.max(-8, Math.min(12, server.trendScore * 0.2))
  return Math.min(99.9, online + rating + reviews + trust + stability + growth)
}

export default function RatingPage() {
  const [game, setGame] = useState<string>('all')

  const ranked = useMemo(() => {
    return liveServers
      .filter((server) => (game === 'all' ? true : server.gameId === game))
      .map((server) => ({ server, score: gameRadarScore(server) }))
      .sort((a, b) => b.score - a.score)
  }, [game])

  const maxScore = ranked[0]?.score ?? 100

  return (
    <div className="pb-16">
      <Container className="pt-10 lg:pt-14">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
            <Trophy size={13} />
            Независимый рейтинг
          </div>
          <h1 className="text-[30px] leading-tight sm:text-[40px]">Рейтинг GameRadar</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            Позиция считается по проверенному онлайну, стабильности данных, оценкам игроков и динамике. Платные
            размещения в этот рейтинг не попадают.
          </p>
        </div>

        <Notice tone="signal" className="mt-6" title="Как формируется позиция">
          Основной вес — проверенный онлайн и доступность сервера за последние 24 часа. Серверы со статусом REPORTED
          получают пониженный вес, а DATA ANOMALY исключаются до окончания перепроверки.
        </Notice>

        <div className="mt-8 flex flex-wrap gap-2">
          <ChipToggle active={game === 'all'} onClick={() => setGame('all')}>
            Все игры
          </ChipToggle>
          {GAMES.filter((item) => liveServers.some((server) => server.gameId === item.id)).map((item) => (
            <ChipToggle key={item.id} active={game === item.id} onClick={() => setGame(item.id)} accent={item.accent}>
              {item.shortName}
            </ChipToggle>
          ))}
        </div>

        <div className="surface mt-6 overflow-hidden rounded-xl">
          <div className="hidden border-b border-white/6 px-5 py-3 text-[11px] tracking-[0.08em] text-ink-500 uppercase lg:grid lg:grid-cols-[48px_1fr_150px_120px_96px_150px] lg:gap-4">
            <span>#</span>
            <span>Сервер</span>
            <span>Онлайн</span>
            <span>Рейтинг</span>
            <span>24 часа</span>
            <span>Score</span>
          </div>

          <div className="divide-y divide-white/5">
            {ranked.map((item, index) => (
              <RankRow key={item.server.slug} server={item.server} rank={index + 1} score={item.score} max={maxScore} />
            ))}
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-[12.5px] text-ink-500">
          <Info size={13} className="mt-0.5 shrink-0" />
          Демонстрационные данные прототипа. В продукте рейтинг пересчитывается раз в час и учитывает историю за 30
          дней.
        </p>
      </Container>
    </div>
  )
}

function RankRow({
  server,
  rank,
  score,
  max,
}: {
  server: GameServer
  rank: number
  score: number
  max: number
}) {
  const game = getGame(server.gameId)
  const medal = rank <= 3

  return (
    <Link
      to={`/server/${server.slug}`}
      className="group grid grid-cols-[36px_1fr_auto] items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03] lg:grid-cols-[48px_1fr_150px_120px_96px_150px] lg:gap-4 lg:px-5"
    >
      <span
        className={cn(
          'num font-display text-[16px] font-semibold',
          medal ? 'text-ink-50' : 'text-ink-500',
        )}
      >
        {rank}
      </span>

      <div className="flex min-w-0 items-center gap-3">
        <ServerLogo name={server.name} hue={server.hue} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-medium text-ink-50">{server.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-400">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: game.accent }} />
            <span className="truncate">
              {game.shortName} · {server.version}
            </span>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="num text-[14.5px] font-medium text-ink-50">{formatNumber(server.online.current)}</div>
        <StatusBadge status={server.online.status} size="sm" className="mt-1" />
      </div>

      <div className="hidden lg:block">
        <div className="num flex items-center gap-1.5 text-[14px] text-ink-100">
          <svg width="12" height="12" viewBox="0 0 20 20" className="text-warn-400" aria-hidden>
            <path
              d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.21l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z"
              fill="currentColor"
            />
          </svg>
          {formatRating(server.rating)}
        </div>
        <div className="num mt-0.5 text-[11.5px] text-ink-500">{formatNumber(server.reviewsCount)} отзывов</div>
      </div>

      <div className="hidden lg:flex lg:flex-col lg:items-start lg:gap-1">
        <TrendChip value={server.trendScore} />
        <Sparkline
          data={server.history['24h']}
          width={72}
          height={16}
          accent={server.online.status === 'verified' ? 'var(--color-signal-400)' : 'var(--color-ink-300)'}
        />
      </div>

      <div className="text-right lg:text-left">
        <div className="num text-[15px] font-semibold text-ink-50">{score.toFixed(1).replace('.', ',')}</div>
        <div className="mt-1.5 hidden h-1 w-full overflow-hidden rounded-full bg-white/7 lg:block">
          <div className="h-full rounded-full bg-signal-500/60" style={{ width: `${(score / max) * 100}%` }} />
        </div>
        <div className="num text-[11px] text-ink-500 lg:hidden">{formatNumber(server.online.current)} онлайн</div>
      </div>
    </Link>
  )
}
