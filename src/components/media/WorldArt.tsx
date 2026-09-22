import { useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { artSrc, artSrcSet, type WorldArt } from '@/data/themeMedia'

/**
 * The bitmap surface of a themed world.
 *
 * One component owns every rule that keeps key art from wrecking the UI:
 * responsive sources, focal-point crops, fade-in, and the scrim that
 * guarantees text, trust badges and ad labels stay readable on top.
 *
 * When a world has no key art (ARK, DayZ, Valheim today) the caller's
 * `fallback` — normally <ProceduralShot> — is rendered instead, so the layout
 * never changes.
 */

export type ScrimPreset = 'hero' | 'poster' | 'card' | 'banner' | 'stage' | 'tile' | 'none'

/** Extra flat dimming per image tone, so bright art doesn't blow out labels. */
const TONE_DIM: Record<WorldArt['tone'], string> = {
  dark: '0%',
  medium: '10%',
  bright: '20%',
}

/** The poster scrim protects text locally, so only bright art gets a light flat dim. */
const POSTER_DIM: Record<WorldArt['tone'], string> = {
  dark: '0%',
  medium: '0%',
  bright: '8%',
}

/** Phones never need more than this — even a 3× screen at 375 px is covered by the 800 px file. */
const MOBILE_MAX_WIDTH = 800

export function ArtImage({
  art,
  sizes,
  priority,
  width = 1600,
  className,
}: {
  art: WorldArt
  sizes: string
  priority?: boolean
  width?: number
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)
  const mobile = art.widths.filter((w) => w <= MOBILE_MAX_WIDTH)
  const capped = mobile.length > 0 && mobile.length < art.widths.length

  const img = (
    <img
      src={artSrc(art, width)}
      srcSet={artSrcSet(art)}
      sizes={sizes}
      alt=""
      aria-hidden
      draggable={false}
      loading={priority ? 'eager' : 'lazy'}
      // eslint-disable-next-line react/no-unknown-property
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={cn('gt-art-img', loaded && 'is-loaded', className)}
      style={
        {
          '--art-pos-d': art.focus.desktop,
          '--art-pos-m': art.focus.mobile,
        } as CSSProperties
      }
    />
  )

  // A separate phone source keeps 1600–3840 px files off small screens
  // regardless of device pixel ratio; desktops choose from the full set.
  if (!capped) return img
  return (
    <picture>
      <source media="(max-width: 639px)" srcSet={artSrcSet(art, mobile)} sizes={sizes} />
      {img}
    </picture>
  )
}

/**
 * Art + scrim, sized by the parent. The parent must be `relative` and clip
 * overflow; this component fills it.
 */
export function WorldArtSurface({
  art,
  fallback,
  scrim = 'card',
  sizes = '100vw',
  priority,
  width,
  zoom,
  className,
  overlay,
  children,
}: {
  art?: WorldArt
  fallback?: ReactNode
  scrim?: ScrimPreset
  sizes?: string
  priority?: boolean
  width?: number
  /** subtle scale-up when the parent group is hovered */
  zoom?: boolean
  className?: string
  /** extra layer painted above the scrim (patterns, tints) */
  overlay?: ReactNode
  children?: ReactNode
}) {
  return (
    <div aria-hidden className={cn('absolute inset-0 overflow-hidden', className)}>
      <div
        className={cn(
          'absolute inset-0',
          zoom && 'transition-transform duration-700 ease-out group-hover:scale-[1.05]',
        )}
      >
        {art ? <ArtImage art={art} sizes={sizes} priority={priority} width={width} /> : fallback}
      </div>

      {scrim !== 'none' && (
        <div
          className="gt-scrim"
          data-preset={scrim}
          style={{ '--art-dim': art ? (scrim === 'poster' ? POSTER_DIM : TONE_DIM)[art.tone] : '0%' } as CSSProperties}
        />
      )}

      {overlay}
      {children}
    </div>
  )
}
