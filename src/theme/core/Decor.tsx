import { cn } from '@/lib/utils'
import { useGameTheme } from './ThemeProvider'
import type { DecorPattern, GameTheme, ParticleKind } from './types'

/* ────────────────────────────────────────────────────────────────────────────
   Decorative layer.
   Every world gets its texture, horizon and particles from data — no themed
   component ever hard-codes a game. All of it is painted with CSS gradients
   and inline SVG, so there are no image assets to ship or licence.
   ──────────────────────────────────────────────────────────────────────────── */

const PATTERN_CSS: Record<DecorPattern, (theme: GameTheme) => React.CSSProperties> = {
  voxel: (t) => ({
    backgroundImage: `
      linear-gradient(${t.colors.primary} 1px, transparent 1px),
      linear-gradient(90deg, ${t.colors.primary} 1px, transparent 1px),
      linear-gradient(135deg, ${t.colors.secondary} 25%, transparent 25%)`,
    backgroundSize: '18px 18px, 18px 18px, 36px 36px',
    backgroundPosition: '0 0, 0 0, 9px 9px',
  }),
  stone: (t) => ({
    backgroundImage: `
      repeating-linear-gradient(-45deg, ${t.colors.primary} 0 1px, transparent 1px 12px),
      repeating-linear-gradient(90deg, ${t.colors.primary} 0 1px, transparent 1px 64px),
      repeating-linear-gradient(0deg, ${t.colors.primary} 0 1px, transparent 1px 32px)`,
  }),
  neon: (t) => ({
    backgroundImage: `
      repeating-linear-gradient(90deg, ${t.colors.secondary} 0 1px, transparent 1px 44px),
      repeating-linear-gradient(0deg, ${t.colors.primary} 0 1px, transparent 1px 44px)`,
  }),
  rust: (t) => ({
    backgroundImage: `
      repeating-radial-gradient(circle at 20% 30%, ${t.colors.primary} 0 1px, transparent 1px 9px),
      repeating-linear-gradient(0deg, ${t.colors.secondary} 0 2px, transparent 2px 46px)`,
  }),
  tactical: (t) => ({
    backgroundImage: `
      linear-gradient(${t.colors.textFaint} 1px, transparent 1px),
      linear-gradient(90deg, ${t.colors.textFaint} 1px, transparent 1px)`,
    backgroundSize: '26px 26px, 26px 26px',
  }),
  plain: () => ({
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)',
    backgroundSize: '14px 14px',
  }),
}

/** Tiling texture of the current world. */
export function ThemePattern({ className, opacity }: { className?: string; opacity?: number }) {
  const theme = useGameTheme()
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{ ...PATTERN_CSS[theme.decor.pattern](theme), opacity: opacity ?? theme.decor.intensity * 0.22 }}
    />
  )
}

const HORIZONS: Record<Exclude<GameTheme['decor']['horizon'], 'none'>, string> = {
  blocks:
    'M0 120h60V90h40V70h50V96h44V64h52V88h48V58h56V86h50V70h44V98h56V76h60v44H0z',
  towers:
    'M0 120h48V74l14-30 14 30v46h34V58l16-34 16 34v62h40V80l18-26 18 26v40h38V66l14-28 14 28v54h40V86l16-22 16 22v34h56v-0H0z',
  city:
    'M0 120h44V72h30V44h34v76h26V58h40v62h30V36h36v84h34V66h32v54h28V50h38v70h48V120H0z',
  ruins:
    'M0 120h36V86l10 6V62l16 10v48h26V74l14-22v68h30V58l12 14v48h34V78l18-10v52h28V64l14 12v44h50V92l12-6v34h60v0H0z',
}

/** Silhouette anchored to the bottom of a hero banner. */
export function ThemeHorizon({ className }: { className?: string }) {
  const theme = useGameTheme()
  if (theme.decor.horizon === 'none') return null
  const path = HORIZONS[theme.decor.horizon]

  return (
    <svg
      aria-hidden
      viewBox="0 0 800 120"
      preserveAspectRatio="none"
      className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full sm:h-32', className)}
    >
      <path d={path} fill={theme.colors.bgDeep} opacity="0.92" />
      <path d={path} fill="none" stroke={theme.colors.primary} strokeWidth="1" opacity="0.28" />
    </svg>
  )
}

/** Deterministic positions so particles never jump between renders. */
const PARTICLE_SEEDS = [
  [8, 62, 0, 7.5], [17, 28, 1.2, 9], [26, 78, 2.4, 6.5], [34, 44, 0.6, 10],
  [43, 18, 3.1, 8], [52, 70, 1.8, 7], [61, 36, 2.9, 9.5], [70, 58, 0.3, 6.8],
  [79, 24, 2.1, 8.6], [88, 66, 1.4, 7.4], [94, 40, 3.4, 9.2], [12, 86, 2.6, 8.2],
]

const PARTICLE_STYLE: Record<Exclude<ParticleKind, 'none'>, { size: number; anim: string; color: (t: GameTheme) => string }> = {
  dust: { size: 2, anim: 'gt-float', color: (t) => t.colors.textFaint },
  embers: { size: 3, anim: 'gt-rise', color: (t) => t.colors.primary },
  rain: { size: 1, anim: 'gt-fall', color: (t) => t.colors.secondary },
  sparks: { size: 2, anim: 'gt-twinkle', color: (t) => t.colors.primary },
}

/** Ambient particles — dust, embers, rain or sparks depending on the world. */
export function ThemeParticles({ className }: { className?: string }) {
  const theme = useGameTheme()
  const kind = theme.decor.particles
  if (kind === 'none') return null
  const style = PARTICLE_STYLE[kind]

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {PARTICLE_SEEDS.map(([left, top, delay, duration], index) => (
        <span
          key={index}
          className="absolute rounded-full"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: kind === 'rain' ? 1 : style.size,
            height: kind === 'rain' ? 14 : style.size,
            background: style.color(theme),
            opacity: 0.45,
            animation: `${style.anim} ${duration}s ease-in-out ${delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/** Corner ornaments matching the world's frame style. */
export function ThemeFrame({ className }: { className?: string }) {
  const theme = useGameTheme()
  const frame = theme.card.frame
  if (frame === 'soft') return null

  const corner = (position: string, rotate: number) => (
    <svg
      key={position}
      viewBox="0 0 24 24"
      className={cn('pointer-events-none absolute h-5 w-5', position)}
      style={{ transform: `rotate(${rotate}deg)`, color: theme.colors.primary }}
      aria-hidden
    >
      {frame === 'carved' && <path d="M1 9V1h8M1 1l7 7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />}
      {frame === 'plated' && (
        <>
          <path d="M1 8V1h7" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <circle cx="5" cy="5" r="1.4" fill="currentColor" opacity="0.55" />
        </>
      )}
      {frame === 'chamfer' && <path d="M1 8 8 1" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />}
      {frame === 'block' && <path d="M1 7V1h6v2H3v4H1Z" fill="currentColor" opacity="0.55" />}
    </svg>
  )

  return (
    <div className={cn('pointer-events-none absolute inset-0', className)}>
      {corner('top-1.5 left-1.5', 0)}
      {corner('top-1.5 right-1.5', 90)}
      {corner('bottom-1.5 right-1.5', 180)}
      {corner('bottom-1.5 left-1.5', 270)}
    </div>
  )
}

/** Large ambient glow used behind themed sections. */
export function ThemeAura({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute rounded-full blur-[90px]', className)}
      style={{ background: 'var(--gt-grad-aura)' }}
    />
  )
}
