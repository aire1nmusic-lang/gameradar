import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Play } from 'lucide-react'
import { cn, hashSeed } from '@/lib/utils'
import { formatPlayers } from '@/lib/format'

import { useAd, useServer } from '@/hooks/data'
import { getGame } from '@/data/games'
import { ThemedBadge, ThemedButton, useGameTheme } from '@/theme'
import { ProceduralShot } from '@/components/art/ProceduralShot'
import { ArtImage, WorldArtSurface } from '@/components/media/WorldArt'
import { promoArt, serverArt } from '@/data/themeMedia'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { StatusBadge, VerifiedLine } from '@/components/trust/status'
import { BoostBadge, PremiumBadge } from '@/components/boost/BoostBadge'

/**
 * Advertising surfaces.
 *
 * Rules that hold in every world:
 *   · a paid slot always carries a visible label;
 *   · ads never imitate an organic card without that label;
 *   · paid placement never changes the independent rating.
 */

export function AdSlot({
  id,
  label = 'Реклама',
  className,
  children,
}: {
  /** slot identifier, published in the DOM for the future ad server */
  id: 'top-banner' | 'sidebar' | 'takeover' | 'featured' | 'inline'
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div data-ad-slot={id} data-ad-label={label} className={cn('ad-slot overflow-hidden', className)}>
      {children}
    </div>
  )
}

/** Full-width banner at the top of a game world. */
export function TopBanner({ gameId, className }: { gameId?: string; className?: string }) {
  const theme = useGameTheme()
  const { data: creative } = useAd('TOP_BANNER', gameId)
  const { data: server } = useServer(creative?.serverId)
  if (!creative) return null

  return (
    <AdSlot id="top-banner" className={cn('group', className)}>
      <Link to={creative.href} className="relative flex min-h-[132px] items-center gap-5 overflow-hidden p-4 sm:min-h-[150px] sm:p-5">
        <WorldArtSurface
          art={server ? serverArt(server) : promoArt(gameId, creative.id)}
          fallback={<ProceduralShot seed={hashSeed(creative.id)} kind="landscape" />}
          scrim="banner"
          zoom
          width={1600}
          sizes="(min-width: 1280px) 1200px, 100vw"
        />

        {server && (
          <div className="relative hidden shrink-0 sm:block">
            <ServerLogo name={server.name} hue={server.hue} size="lg" />
          </div>
        )}

        <div className="relative min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] tracking-[0.14em] uppercase" style={{ color: theme.colors.textFaint }}>
              {creative.advertiser}
            </span>
            {server && <StatusBadge status={server.online.status} size="sm" launching={!!server.launch} />}
          </div>
          <div className="gt-display text-[19px] leading-tight sm:text-[24px]">{creative.headline}</div>
          <p className="clamp-2 mt-1 max-w-xl text-[13px]" style={{ color: theme.colors.textMuted }}>
            {creative.sub}
          </p>
        </div>

        <div className="relative hidden shrink-0 flex-col items-end gap-2 sm:flex">
          {server && server.online.status !== 'PENDING' && (
            <div className="text-right">
              <div className="num gt-display text-[22px] leading-none">{formatPlayers(server.online)}</div>
              <div className="mt-1">
                <VerifiedLine online={server.online} launching={!!server.launch} size="xs" />
              </div>
            </div>
          )}
          <ThemedButton size="md" iconRight={<ArrowRight size={14} />}>
            {creative.cta}
          </ThemedButton>
        </div>
      </Link>
    </AdSlot>
  )
}

/** Sticky 300×600-style rail unit. */
export function SidebarBanner({ gameId, className }: { gameId?: string; className?: string }) {
  const theme = useGameTheme()
  const { data: creative } = useAd('SIDEBAR', gameId)
  const { data: server } = useServer(creative?.serverId)
  if (!creative) return null

  return (
    <AdSlot id="sidebar" className={cn('group', className)}>
      <Link to={creative.href} className="relative flex h-[420px] flex-col overflow-hidden">
        <div className="relative h-[190px] overflow-hidden">
          <WorldArtSurface
            art={server ? serverArt(server) : promoArt(gameId, `${creative.id}-side`)}
            fallback={<ProceduralShot seed={hashSeed(creative.id)} kind="combat" />}
            scrim="card"
            zoom
            width={400}
            sizes="320px"
          />
          {server && (
            <div className="absolute -bottom-5 left-4">
              <ServerLogo name={server.name} hue={server.hue} size="md" />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col px-4 pt-8 pb-4">
          <span className="text-[11px] tracking-[0.14em] uppercase" style={{ color: theme.colors.textFaint }}>
            {creative.advertiser}
          </span>
          <div className="gt-display mt-1.5 text-[20px] leading-tight">{creative.headline}</div>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: theme.colors.textMuted }}>
            {creative.sub}
          </p>

          {server && (
            <div className="mt-4 space-y-2">
              <StatusBadge status={server.online.status} size="sm" launching={!!server.launch} />
              <div className="flex items-baseline gap-1.5">
                <span className="num gt-display text-[24px] leading-none">{formatPlayers(server.online)}</span>
                <span className="num text-[12px]" style={{ color: theme.colors.textFaint }}>
                  игроков сейчас
                </span>
              </div>
            </div>
          )}

          <ThemedButton full size="md" className="mt-auto" iconRight={<ArrowRight size={14} />}>
            {creative.cta}
          </ThemedButton>
        </div>
      </Link>
    </AdSlot>
  )
}

/**
 * Background takeover: a branded layer behind the world. Always declared with
 * a floating label, and always dimmed enough to keep content readable.
 */
export function BackgroundTakeover({ gameId }: { gameId?: string }) {
  const { data: creative } = useAd('TAKEOVER', gameId)
  const takeoverArt = promoArt(gameId, `${creative?.id ?? 'x'}-bg`)
  if (!creative) return null

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px] overflow-hidden">
      <div className="absolute inset-0 opacity-[0.28]">
        {takeoverArt ? (
          <ArtImage art={takeoverArt} sizes="100vw" width={1600} />
        ) : (
          <ProceduralShot seed={hashSeed(`${creative.id}-bg`)} kind="landscape" detail={false} />
        )}
      </div>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, var(--gt-bg) 78%)' }} />
      <div className="pointer-events-auto absolute top-3 right-4 z-10">
        <Link
          to={creative.href}
          className="inline-flex items-center gap-2 rounded-md border border-promo-400/30 bg-ink-1000/70 px-2.5 py-1 font-mono text-[9.5px] tracking-[0.14em] text-promo-200 uppercase backdrop-blur-sm transition-colors hover:border-promo-400/60"
        >
          Реклама · {creative.advertiser}
        </Link>
      </div>
    </div>
  )
}

/** Large paid card shown above the organic rating. */
export function FeaturedServerCard({ gameId, className }: { gameId?: string; className?: string }) {
  const theme = useGameTheme()
  const { data: creative } = useAd('TAKEOVER', gameId)
  const { data: server } = useServer(creative?.serverId)
  if (!creative || !server) return null

  const game = getGame(server.gameId)

  return (
    <AdSlot id="featured" label="Featured · продвижение" className={cn('group', className)}>
      <div className="relative grid overflow-hidden md:grid-cols-[1.1fr_1fr]">
        <div className="relative min-h-[200px] overflow-hidden">
          <WorldArtSurface
            art={serverArt(server)}
            fallback={<ProceduralShot seed={hashSeed(server.slug)} kind="landscape" />}
            scrim="card"
            zoom
            width={800}
            sizes="(min-width: 768px) 560px, 100vw"
            className="md:[&_.gt-scrim]:opacity-55"
          />
          <div
            className="absolute inset-y-0 right-0 hidden w-32 md:block"
            style={{ background: `linear-gradient(to right, transparent, ${theme.colors.surfaceRaised})` }}
          />
          <div className="absolute top-3 left-3 flex gap-2">
            <StatusBadge status={server.online.status} size="sm" launching={!!server.launch} />
            <PremiumBadge />
          </div>
        </div>

        <div className="relative flex flex-col justify-center gap-3 p-5 sm:p-6" style={{ background: theme.colors.surfaceRaised }}>
          <div className="flex items-center gap-3">
            <ServerLogo name={server.name} hue={server.hue} size="md" />
            <div className="min-w-0">
              <div className="gt-display truncate text-[20px] leading-tight">{server.name}</div>
              <div className="text-[12.5px]" style={{ color: theme.colors.textFaint }}>
                {game.shortName} · {server.version} · {server.flag} {server.region}
              </div>
            </div>
          </div>

          <p className="clamp-2 text-[13.5px] leading-relaxed" style={{ color: theme.colors.textMuted }}>
            {server.summary}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {server.modes.slice(0, 3).map((mode) => (
              <ThemedBadge key={mode}>{mode}</ThemedBadge>
            ))}
          </div>

          <div className="flex items-end justify-between gap-4 pt-1">
            <div>
              <div className="num gt-display text-[28px] leading-none">{formatPlayers(server.online)}</div>
              <div className="mt-1.5">
                <VerifiedLine online={server.online} launching={!!server.launch} size="xs" />
              </div>
            </div>
            <ThemedButton to={`/server/${server.slug}`} icon={<Play size={13} fill="currentColor" />}>
              Играть
            </ThemedButton>
          </div>
        </div>
      </div>
    </AdSlot>
  )
}

/** Compact in-list promo unit, used between organic results. */
export function InlinePromo({ gameId, className }: { gameId?: string; className?: string }) {
  const theme = useGameTheme()
  const { data: creative } = useAd('SIDEBAR', gameId)
  if (!creative) return null

  return (
    <AdSlot id="inline" label="Продвижение" className={cn('group', className)}>
      <Link to={creative.href} className="flex items-center gap-4 p-4">
        <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md">
          <WorldArtSurface
            art={promoArt(gameId, `${creative.id}-inline`)}
            fallback={<ProceduralShot seed={hashSeed(`${creative.id}-inline`)} kind="map" detail={false} />}
            scrim="tile"
            width={400}
            sizes="80px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium" style={{ color: theme.colors.text }}>
              {creative.headline}
            </span>
            <BoostBadge />
          </div>
          <p className="clamp-1 mt-0.5 text-[12.5px]" style={{ color: theme.colors.textFaint }}>
            {creative.advertiser} · {creative.sub}
          </p>
        </div>
        <ArrowRight size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: theme.colors.textFaint }} />
      </Link>
    </AdSlot>
  )
}
