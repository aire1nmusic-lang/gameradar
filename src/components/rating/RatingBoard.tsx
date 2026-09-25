import { Link } from 'react-router-dom'
import { Crown, Play, ShieldCheck, Star, Zap } from 'lucide-react'
import { cn, hashSeed } from '@/lib/utils'
import { formatCompact, formatNumber, formatPlayers, formatRating } from '@/lib/format'
import { chronicleOfVersion, getGame } from '@/data/games'
import type { RankedServer } from '@/models'
import { ThemedButton, ThemedCard, useGameTheme } from '@/theme'
import { ProceduralShot } from '@/components/art/ProceduralShot'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { serverArt } from '@/data/themeMedia'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { StatusBadge, VerifiedLine } from '@/components/trust/status'
import { Sparkline } from '@/components/charts/AreaChart'
import { BoostBadge, TierBadge } from '@/components/boost/BoostBadge'
import { ServerRow } from '@/components/server/ServerRow'

/**
 * Rating board.
 *
 * Two lists, never mixed:
 *   · the independent rating — earned points only;
 *   · promoted servers — paid, labelled, and shown apart.
 *
 * Both show the same score breakdown so the difference is verifiable.
 */

export function RatingPodium({ entries }: { entries: RankedServer[] }) {
  const theme = useGameTheme()
  const top3 = entries.slice(0, 3)
  if (top3.length === 0) return null

  // A phone reads 1–2–3 top to bottom; a desktop puts the winner in the middle: 2 – 1 – 3.
  const podiumOrder: Record<number, string> = { 1: 'sm:order-2', 2: 'sm:order-1', 3: 'sm:order-3' }

  return (
    <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
      {top3.map((entry) => {
        const isFirst = entry.rank === 1
        const server = entry.server
        const game = getGame(server.gameId)
        return (
          <ThemedCard
            key={server.slug}
            interactive
            className={cn('group relative flex flex-col overflow-hidden', podiumOrder[entry.rank], isFirst && 'sm:-mt-6')}
          >
            <Link to={`/server/${server.slug}`} className="absolute inset-0 z-[1]" aria-label={server.name} />

            <div className={cn('relative overflow-hidden', isFirst ? 'h-[132px]' : 'h-[104px]')}>
              <WorldArtSurface
                art={serverArt(server)}
                fallback={<ProceduralShot seed={hashSeed(server.slug)} kind={isFirst ? 'combat' : 'landscape'} />}
                scrim="card"
                zoom
                width={800}
                sizes="(min-width: 640px) 33vw, 100vw"
              />

              <div className="absolute top-2.5 left-2.5 z-[2] flex items-center gap-2">
                <TierBadge rank={entry.rank} />
                {isFirst && <Crown size={14} className="text-warn-300" />}
              </div>
              {/* Three narrow columns on a tablet leave no room next to the tier chip; the body line carries the status there. */}
              <div className="absolute top-2.5 right-2.5 z-[2] sm:hidden lg:block">
                <StatusBadge status={server.online.status} size="sm" launching={!!server.launch} />
              </div>

              <div className="absolute -bottom-5 left-4 z-[2]">
                <ServerLogo
                  name={server.name}
                  gameId={server.gameId}
                  hue={server.hue}
                  src={server.logoUrl}
                  size={isFirst ? 'lg' : 'md'}
                  style={{ boxShadow: `0 0 0 3px ${theme.colors.surfaceRaised}` }}
                />
              </div>
            </div>

            <div className="relative flex flex-1 flex-col px-4 pt-8 pb-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className={cn('gt-display truncate', isFirst ? 'text-[20px]' : 'text-[17px]')}>{server.name}</h3>
                <span className="num font-mono text-[12px]" style={{ color: theme.colors.textFaint }}>
                  #{entry.rank}
                </span>
              </div>

              <div className="mt-1 text-[12px]" style={{ color: theme.colors.textFaint }}>
                {game.shortName} · {chronicleOfVersion(server.gameId, server.version)?.label ?? server.version}
              </div>

              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <div className="num gt-display text-[22px] leading-none">{formatPlayers(server.online)}</div>
                  <div className="mt-1.5">
                    <VerifiedLine online={server.online} launching={!!server.launch} size="xs" />
                  </div>
                </div>
                <Sparkline data={server.history['24h']} width={62} accent={theme.colors.primary} />
              </div>

              {entry.organic + entry.boosts > 0 && <ScoreBar entry={entry} className="mt-3.5" />}

              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="num inline-flex items-center gap-1 text-[12.5px]" style={{ color: theme.colors.textMuted }}>
                  {server.rating > 0 && (
                    <>
                      <Star size={12} className="text-warn-400" fill="currentColor" />
                      {formatRating(server.rating)}
                      <span style={{ color: theme.colors.textFaint }}>({formatCompact(server.reviewsCount)})</span>
                    </>
                  )}
                </span>
                <ThemedButton
                  to={`/server/${server.slug}`}
                  size="sm"
                  className="relative z-[2]"
                  icon={<Play size={12} fill="currentColor" />}
                >
                  Играть
                </ThemedButton>
              </div>
            </div>
          </ThemedCard>
        )
      })}
    </div>
  )
}

/** Earned vs bought points, always drawn side by side. */
export function ScoreBar({ entry, className }: { entry: RankedServer; className?: string }) {
  const theme = useGameTheme()
  const total = Math.max(1, entry.organic + entry.boosts)
  const organicShare = (entry.organic / total) * 100

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between font-mono text-[10.5px]">
        <span className="inline-flex items-center gap-1" style={{ color: theme.colors.textFaint }}>
          <ShieldCheck size={10} className="text-signal-400" />
          {formatNumber(entry.organic)} очков
        </span>
        {entry.boosts > 0 && (
          <span className="inline-flex items-center gap-1 text-promo-300">
            <Zap size={10} fill="currentColor" />+{formatNumber(entry.boosts)} бустов
          </span>
        )}
      </div>
      <div className="flex h-[3px] overflow-hidden rounded-full" style={{ background: theme.colors.border }}>
        <div className="h-full bg-signal-500/70" style={{ width: `${organicShare}%` }} />
        {entry.boosts > 0 && <div className="h-full flex-1 bg-promo-500/70" />}
      </div>
    </div>
  )
}

export function RatingRow({
  entry,
  showScore = true,
  className,
}: {
  entry: RankedServer
  showScore?: boolean
  className?: string
}) {
  const theme = useGameTheme()
  const server = entry.server
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)

  return (
    <Link
      to={`/server/${server.slug}`}
      className={cn('group relative flex items-center gap-3 rounded-lg border px-3 py-3 transition-all duration-200 sm:gap-4 sm:px-4', className)}
      style={{ borderColor: theme.colors.border, background: `color-mix(in oklab, ${theme.colors.surfaceRaised} 55%, transparent)` }}
    >
      <span
        className="num w-7 shrink-0 text-center font-mono text-[13px]"
        style={{ color: entry.rank <= 10 ? theme.colors.primary : theme.colors.textFaint }}
      >
        {entry.rank}
      </span>

      <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} src={server.logoUrl} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-medium" style={{ color: theme.colors.text }}>
            {server.name}
          </span>
          {entry.rank <= 3 && <TierBadge rank={entry.rank} className="hidden sm:inline-flex" />}
          {entry.boosted && <BoostBadge className="hidden md:inline-flex" />}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px]" style={{ color: theme.colors.textFaint }}>
          <span className="truncate">
            {game.shortName} · {chronicle?.label ?? server.version}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">
            {server.flag} {server.region}
          </span>
        </div>
      </div>

      <div className="hidden shrink-0 lg:block">
        <Sparkline data={server.history['24h']} width={58} accent={theme.colors.primary} />
      </div>

      {showScore && entry.organic + entry.boosts > 0 && (
        <div className="hidden w-[132px] shrink-0 md:block">
          <ScoreBar entry={entry} />
        </div>
      )}

      <div className="w-[84px] shrink-0 text-right sm:w-[104px]">
        <div className="num text-[15px] font-semibold" style={{ color: theme.colors.text }}>
          {formatPlayers(server.online)}
        </div>
        <div className="mt-0.5 hidden justify-end sm:flex">
          <VerifiedLine online={server.online} launching={!!server.launch} size="xs" />
        </div>
      </div>

      {server.rating > 0 && (
        <div className="hidden w-[58px] shrink-0 text-right sm:block">
          <span className="num inline-flex items-center gap-1 text-[13px]" style={{ color: theme.colors.textMuted }}>
            <Star size={11} className="text-warn-400" fill="currentColor" />
            {formatRating(server.rating)}
          </span>
        </div>
      )}
    </Link>
  )
}

/** Positions below the podium: the same dense row as everywhere else, ranked. */
export function RatingList({ entries, from = 4 }: { entries: RankedServer[]; from?: number }) {
  const rest = entries.filter((entry) => entry.rank >= from)
  if (rest.length === 0) return null
  return (
    <div className="space-y-1.5">
      {rest.map((entry) => (
        <ServerRow key={entry.server.slug} server={entry.server} rank={entry.rank} />
      ))}
    </div>
  )
}

/** Paid placements, shown apart from the independent rating. */
export function BoostedStrip({ entries, limit = 3 }: { entries: RankedServer[]; limit?: number }) {
  const theme = useGameTheme()
  const boosted = entries.filter((entry) => entry.boosted).slice(0, limit)
  if (boosted.length === 0) return null

  return (
    <div className="rounded-xl border border-promo-500/20 bg-promo-900/20 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={13} className="text-promo-300" fill="currentColor" />
            <h3 className="text-[15px] font-medium text-ink-50">Продвигаемые серверы</h3>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-400">
            Платные места. Не влияют на позиции в независимом рейтинге выше.
          </p>
        </div>
        <Link
          to="/boost"
          className="rounded-md border border-promo-400/30 px-3 py-1.5 text-[12.5px] text-promo-200 transition-colors hover:border-promo-400/60"
        >
          Как сюда попасть
        </Link>
      </div>

      <div className="space-y-1.5">
        {boosted.map((entry) => (
          <div key={entry.server.slug} className="relative">
            <RatingRow entry={entry} showScore={false} className="!border-promo-500/20" />
            <span
              className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 md:block"
              style={{ color: theme.colors.textFaint }}
            >
              <BoostBadge boosts={entry.boosts} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
