import { useEffect, useState, type CSSProperties } from 'react'
import { Axe, BedDouble, Biohazard, Car, Cloud, Crosshair, Crown, Flame, Gamepad2, Gem, Lock, Navigation, Pickaxe, Puzzle, Shield, Siren, Skull, Swords, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GAMES_BY_ID } from '@/data/games'
import { useAppearance } from '@/theme/appearance'
import './server-logo.css'

/** The game's sign for servers without their own logo (default icon styles "glyph" and "crest"). */
const GAME_GLYPH: Record<string, LucideIcon> = {
  lineage2: Swords,
  minecraft: Pickaxe,
  gtarp: Car,
  rust: Axe,
  cs2: Crosshair,
  dayz: Biohazard,
}
/** A chronicle or a mode has its own sign, so a list reads at a glance: High Five is a shield, SkyBlock a cloud. */
const KIND_GLYPH: Record<string, LucideIcon> = {
  interlude: Swords,
  'high-five': Shield,
  essence: Gem,
  classic: Crown,
  gracia: Flame,
  survival: Pickaxe,
  anarchy: Skull,
  skyblock: Cloud,
  bedwars: BedDouble,
  prison: Lock,
  modded: Puzzle,
  fivem: Car,
  ragemp: Siren,
  altv: Navigation,
}
const DEFAULT_AVATAR: Record<string, string> = {
  lineage2: '/media/ui/lineage2-default-avatar.webp',
  minecraft: '/media/ui/minecraft-default-avatar.webp',
  gtarp: '/media/ui/gtarp-default-avatar.webp',
}
const GLYPH_PX = { xs: 15, sm: 19, md: 22, lg: 28, xl: 38 } as const

const SIZES = {
  xs: 'h-8 w-8 rounded-sm text-[11px]',
  sm: 'h-10 w-10 rounded-md text-[13px]',
  md: 'h-12 w-12 rounded-lg text-[15px]',
  lg: 'h-16 w-16 rounded-lg text-xl',
  xl: 'h-[88px] w-[88px] rounded-xl text-3xl',
}

export function initialsOf(name: string): string {
  const caps = name.replace(/[^A-Za-zА-Яа-я0-9 ]/g, '').match(/[A-ZА-Я0-9]/g)
  if (caps && caps.length >= 2) return caps.slice(0, 2).join('')
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/**
 * The server's own icon when it has one (the icon a Minecraft server answers
 * with, or an uploaded logo); a hue-seeded monogram only as the fallback.
 */
export function ServerLogo({
  name,
  hue,
  src,
  gameId,
  kind,
  size = 'md',
  className,
  style,
  forceGameGlyph = false,
}: {
  name: string
  hue: number
  /** picks the game sign for the "glyph" and "crest" default styles */
  gameId?: string
  /** chronicle or mode id: gives the sign its own shape inside the game colours */
  kind?: string
  /** real logo url; the monogram is drawn until it loads and if it fails */
  src?: string
  size?: keyof typeof SIZES
  className?: string
  /** keep one neutral fallback per game even if the designer preference is monogram/crest */
  forceGameGlyph?: boolean
  /** extra style — themed worlds use it to paint a ring in the world colour */
  style?: CSSProperties
}) {
  const [failed, setFailed] = useState(false)
  useEffect(()=>setFailed(false),[src])
  const { appearance } = useAppearance()
  const showImage = !!src && !failed
  const game = gameId ? GAMES_BY_ID[gameId] : undefined
  const Glyph = forceGameGlyph
    ? ((gameId && GAME_GLYPH[gameId]) || Gamepad2)
    : ((kind && KIND_GLYPH[kind]) || (gameId && GAME_GLYPH[gameId]) || Gamepad2)

  // An approved server logo always wins; the default style only fills the gap.
  // Lineage 2 free/default avatar: approved neutral tree emblem. Paid/official logo always wins above it.
  // Minecraft and GTA RP: owner-approved base avatars for every server without its own logo.
  const defaultAvatar = gameId && DEFAULT_AVATAR[gameId]
  if (!showImage && defaultAvatar && (gameId !== 'lineage2' || forceGameGlyph)) {
    return (
      <div
        className={cn('relative grid shrink-0 place-items-center overflow-hidden text-white', SIZES[size], className)}
        style={{
          background: '#101711',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 0 1px rgba(207,174,103,0.28)',
          ...style,
        }}
        aria-hidden
        data-default-avatar={gameId}
      >
        <img
          src={defaultAvatar}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  if (!showImage && game && (forceGameGlyph || appearance.icons === 'glyph')) {
    return (
      <div
        className={cn('relative grid shrink-0 place-items-center overflow-hidden text-white', SIZES[size], className)}
        style={{
          background: `linear-gradient(145deg, color-mix(in srgb, ${game.from} 24%, #29313a), color-mix(in srgb, ${game.to} 16%, #171d24))`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.1)',
          ...style,
        }}
        aria-hidden
      >
        <span className="absolute inset-0 bg-gradient-to-b from-white/10 to-black/25" />
        <Glyph size={GLYPH_PX[size]} strokeWidth={2.1} className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" />
      </div>
    )
  }
  if (!showImage && appearance.icons === 'crest') {
    const badge = Math.round(GLYPH_PX[size] * 0.8)
    return (
      <div className={cn('relative shrink-0', SIZES[size].replace(/rounded-S+/, ''), className)} style={style} aria-hidden>
        <div
          className="absolute inset-0 grid place-items-center font-display font-semibold tracking-tight text-white/95"
          style={{
            clipPath: 'polygon(50% 0, 100% 13%, 100% 58%, 50% 100%, 0 58%, 0 13%)',
            background: `linear-gradient(160deg, hsl(${hue} 20% 30%), hsl(${(hue + 38) % 360} 16% 20%))`,
          }}
        >
          <span className="-mt-[8%] drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{initialsOf(name)}</span>
        </div>
        {game && (
          <span
            className="absolute -right-1 -bottom-1 grid place-items-center rounded-full text-white ring-2 ring-[var(--color-ink-900)]"
            style={{ width: badge + 6, height: badge + 6, background: `linear-gradient(145deg, ${game.from}, ${game.to})` }}
          >
            <Glyph size={badge - 4} strokeWidth={2.4} />
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden font-display font-semibold tracking-tight text-white/95',
        SIZES[size],
        className,
      )}
      style={{
        background: showImage
          ? 'var(--color-ink-800)'
          : `linear-gradient(145deg, hsl(${hue} 20% 30%), hsl(${(hue + 42) % 360} 16% 20%))`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.08)',
        ...style,
      }}
      aria-hidden
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover [image-rendering:auto]"
        />
      ) : (
        <>
          <span className="absolute inset-0 opacity-30 mix-blend-overlay texture-dots" style={{ backgroundSize: '8px 8px' }} />
          <span className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{initialsOf(name)}</span>
        </>
      )}
    </div>
  )
}
