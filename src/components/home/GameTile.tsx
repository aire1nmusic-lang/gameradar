import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { formatCompact, formatNumber, plural } from '@/lib/format'
import { worldArt } from '@/data/themeMedia'
import { themeForGame } from '@/data/themes'
import { ThemeScope } from '@/theme'
import { WorldArtSurface } from '@/components/media/WorldArt'
import type { Game, GameMotif } from '@/models'

/** Abstract geometric motifs — a hint of the genre, never literal game art. */
function Motif({ kind }: { kind: GameMotif }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'cubes':
      return (
        <g {...common}>
          <path d="M40 18 62 30v24L40 66 18 54V30L40 18Z" />
          <path d="M40 42 62 30M40 42v24M40 42 18 30" />
          <path d="M40 4 51 10v12L40 28 29 22V10L40 4Z" opacity="0.55" />
        </g>
      )
    case 'skyline':
      return (
        <g {...common}>
          <path d="M6 70V38h14v32M24 70V22h16v48M44 70V44h12v26M60 70V30h12v40" />
          <path d="M2 70h76" />
          <path d="M28 30h8M28 38h8M48 52h4M64 40h4" opacity="0.6" />
        </g>
      )
    case 'spire':
      return (
        <g {...common}>
          <path d="M40 6 52 34v32H28V34L40 6Z" />
          <path d="M28 44h24M28 54h24" opacity="0.6" />
          <path d="M16 70V46l12-8M64 70V46l-12-8" />
        </g>
      )
    case 'barrel':
      return (
        <g {...common}>
          <rect x="22" y="18" width="36" height="48" rx="6" />
          <path d="M22 32h36M22 52h36" opacity="0.6" />
          <path d="M40 18v48" opacity="0.4" />
          <path d="M14 66h52" />
        </g>
      )
    case 'crosshair':
      return (
        <g {...common}>
          <circle cx="40" cy="42" r="24" />
          <circle cx="40" cy="42" r="10" opacity="0.6" />
          <path d="M40 8v16M40 60v16M6 42h16M58 42h16" />
        </g>
      )
    case 'leaf':
      return (
        <g {...common}>
          <path d="M40 70C18 60 14 34 30 16c18 6 32 24 30 44-6 6-14 9-20 10Z" />
          <path d="M40 70c0-18 4-34 12-46" opacity="0.6" />
        </g>
      )
    case 'signal':
      return (
        <g {...common}>
          <path d="M40 66V30" />
          <circle cx="40" cy="24" r="6" />
          <path d="M22 66c0-14 8-24 18-24s18 10 18 24" opacity="0.5" />
          <path d="M10 68c0-22 13-38 30-38s30 16 30 38" opacity="0.3" />
        </g>
      )
    case 'rune':
      return (
        <g {...common}>
          <path d="M40 8 66 22v30L40 66 14 52V22L40 8Z" />
          <path d="M32 28v22M48 28v22M32 38h16" opacity="0.65" />
        </g>
      )
  }
}

/**
 * Entry tile of a game world.
 *
 * Wrapped in the game's own ThemeScope (display:contents, so no layout cost)
 * so the art scrim is mixed from that world's palette — the tile is a small
 * preview of the world it opens.
 */
export function GameTile({ game, className, compact }: { game: Game; className?: string; compact?: boolean }) {
  const art = worldArt('hero', game.id)

  return (
    <ThemeScope theme={themeForGame(game.id)} as="div" className="contents">
    <Link
      to={`/${game.slug}`}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-white/7 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/16',
        compact ? 'h-[104px]' : 'h-[148px]',
        className,
      )}
    >
      {art ? (
        <WorldArtSurface
          art={art}
          scrim="tile"
          zoom
          width={800}
          sizes="(min-width: 1024px) 420px, 50vw"
        />
      ) : (
        <>
          <div
            className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]"
            style={{ background: `linear-gradient(135deg, ${game.from}, ${game.to})` }}
          />
          <div className="absolute inset-0 texture-lines opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-tr from-ink-950 via-ink-950/72 to-ink-950/25" />
        </>
      )}

      <svg
        viewBox="0 0 80 80"
        className={cn(
          'absolute -right-2 -bottom-3 h-[118px] w-[118px] text-white transition-all duration-500 group-hover:-translate-y-1',
          art ? 'opacity-[0.10] group-hover:opacity-[0.16]' : 'opacity-[0.13] group-hover:opacity-[0.2]',
        )}
        aria-hidden
      >
        <Motif kind={game.motif} />
      </svg>

      <div className="relative flex h-full flex-col justify-between p-4">
        <div>
          <h3 className={cn('font-semibold text-white', compact ? 'text-[15px]' : 'text-[17px]')}>{game.shortName}</h3>
          {!compact && <p className="clamp-1 mt-1 hidden max-w-[70%] text-[12.5px] text-white/60 sm:block">{game.tagline}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
          <span className="num rounded-full whitespace-nowrap border border-white/12 bg-ink-1000/45 px-2 py-[3px] text-white/85 backdrop-blur-sm">
            {formatNumber(game.serversCount)} {plural(game.serversCount, ['сервер', 'сервера', 'серверов'])}
          </span>
          {game.playersOnline > 0 && (
            <span className="num flex items-center gap-1.5 whitespace-nowrap text-white/70">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
              {formatCompact(game.playersOnline)}
            </span>
          )}
        </div>
      </div>
    </Link>
    </ThemeScope>
  )
}
