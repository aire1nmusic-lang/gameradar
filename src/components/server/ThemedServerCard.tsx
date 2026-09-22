import { Link } from 'react-router-dom'
import { Play, Star, Users } from 'lucide-react'
import { cn, hashSeed } from '@/lib/utils'
import { formatNumber, formatRating } from '@/lib/format'
import { chronicleOfVersion, getGame } from '@/data/games'
import { activeBoosts } from '@/services'
import type { GameServer } from '@/models'
import { ThemedBadge, ThemedButton, ThemedCard, useGameTheme } from '@/theme'
import { ProceduralShot } from '@/components/art/ProceduralShot'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { serverArt } from '@/data/themeMedia'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { StatusBadge, VerifiedLine } from '@/components/trust/status'
import { TrendChip } from '@/components/ui/Badge'
import { Sparkline } from '@/components/charts/AreaChart'
import { BoostBadge } from '@/components/boost/BoostBadge'
import { FavoriteButton } from './ServerCard'

/**
 * The server card inside a themed game world.
 *
 * Identity (art, frame, buttons, typography) comes from the theme.
 * Trust signals (VERIFIED / REPORTED / OFFLINE) and commerce signals
 * (BOOSTED) keep their platform colours in every world — a player must be
 * able to read them the same way everywhere.
 */
export function ThemedServerCard({
  server,
  rank,
  className,
  compact,
}: {
  server: GameServer
  rank?: number
  className?: string
  compact?: boolean
}) {
  const theme = useGameTheme()
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const boosts = activeBoosts(server)
  const art = serverArt(server)
  const { status, current, max, change24h } = server.online
  const capacity = max > 0 ? Math.min(100, (current / max) * 100) : 0

  return (
    <ThemedCard interactive className={cn('group flex h-full flex-col overflow-hidden', className)}>
      {/* whole-card target; buttons sit above it */}
      <Link
        to={`/server/${server.slug}`}
        className="absolute inset-0 z-[1]"
        aria-label={`Открыть страницу сервера ${server.name}`}
      />

      <div className={cn('relative overflow-hidden', compact ? 'h-[92px]' : 'h-[124px]')}>
        <WorldArtSurface
          art={art}
          fallback={<ProceduralShot seed={hashSeed(server.slug)} kind={server.promo ? 'combat' : 'landscape'} />}
          scrim="card"
          zoom
          width={800}
          sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
        />

        <div className="absolute top-2.5 left-2.5 z-[2] flex flex-wrap items-center gap-1.5">
          <StatusBadge status={status} size="sm" launching={!!server.launch} />
          {boosts > 0 && <BoostBadge boosts={boosts} />}
        </div>

        <div className="absolute top-1.5 right-1.5 z-[2]">
          <FavoriteButton slug={server.slug} />
        </div>

        {rank !== undefined && (
          <div
            className="absolute right-3 bottom-2.5 z-[2] font-mono text-[11px] tracking-[0.12em] uppercase"
            style={{ color: theme.colors.textFaint }}
          >
            #{rank}
          </div>
        )}

        <div className="absolute -bottom-5 left-3.5 z-[2]">
          <ServerLogo
            name={server.name}
            hue={server.hue}
            size={compact ? 'sm' : 'md'}
            className="ring-2"
            style={{ boxShadow: `0 0 0 3px ${theme.colors.surfaceRaised}` }}
          />
        </div>
      </div>

      <div className="relative flex flex-1 flex-col px-4 pt-7 pb-4">
        <h3 className="gt-display truncate text-[16px] leading-6">{server.name}</h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: theme.colors.textFaint }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.colors.primary }} />
            {game.shortName}
          </span>
          <span>·</span>
          <span style={{ color: theme.colors.textMuted }}>{chronicle?.label ?? server.version}</span>
          <span>·</span>
          <span>
            {server.flag} {server.region}
          </span>
        </div>

        <div className="mt-3.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span
                className="num gt-display text-[24px] leading-none"
                style={{ color: status === 'OFFLINE' ? theme.colors.textFaint : theme.colors.text }}
              >
                {status === 'PENDING' ? '—' : formatNumber(current)}
              </span>
              <span className="num text-[12.5px]" style={{ color: theme.colors.textFaint }}>
                / {formatNumber(max)}
              </span>
            </div>
            <div className="mt-1.5">
              <VerifiedLine status={status} seconds={server.online.checkedAgoSec} source={server.online.source} size="xs" />
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {status !== 'PENDING' && status !== 'OFFLINE' && <TrendChip value={change24h} />}
            {server.history['24h'].length > 1 && (
              <Sparkline
                data={server.history['24h']}
                width={70}
                accent={status === 'OFFLINE' ? 'var(--color-danger-400)' : theme.colors.primary}
              />
            )}
          </div>
        </div>

        <div className="mt-3 h-[3px] overflow-hidden rounded-full" style={{ background: theme.colors.border }}>
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{
              width: `${capacity}%`,
              background: status === 'OFFLINE' ? 'var(--color-danger-500)' : theme.colors.primary,
              opacity: 0.8,
            }}
          />
        </div>

        {!compact && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {server.modes.slice(0, 3).map((mode) => (
              <ThemedBadge key={mode}>{mode}</ThemedBadge>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <div className="flex items-center gap-3 text-[12px]" style={{ color: theme.colors.textMuted }}>
            {server.rating > 0 ? (
              <span className="num inline-flex items-center gap-1">
                <Star size={12} className="text-warn-400" fill="currentColor" />
                {formatRating(server.rating)}
                <span style={{ color: theme.colors.textFaint }}>({formatNumber(server.reviewsCount)})</span>
              </span>
            ) : (
              <span className="num inline-flex items-center gap-1">
                <Users size={12} />
                {formatNumber(server.favorites)}
              </span>
            )}
          </div>

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
}
