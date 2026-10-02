import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { formatCompact, plural } from '@/lib/format'
import { worldArt } from '@/data/themeMedia'
import type { Chronicle, Game } from '@/models'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { useGameTheme } from '@/theme'

/**
 * Chronicles of Lineage 2, modes of Minecraft — small picture tiles, the only place
 * where pictures live: the player sees the genre before the click, servers stay plain.
 */
export function ChronicleTiles({ game, chronicles, counts, className }: {
  game: Game
  chronicles: Chronicle[]
  /** live count per chronicle id, from the loaded list */
  counts: Record<string, { servers: number; online: number }>
  className?: string
}) {
  const theme = useGameTheme()
  // a chronicle with no servers yet is not an entry point
  const shown = chronicles.filter((chronicle) => counts[chronicle.id]?.servers)
  if (shown.length < 2) return null
  return (
    <div className={cn('rail -mx-5 scroll-pl-5 px-5 sm:mx-0 sm:scroll-pl-0 sm:px-0', className)} style={{ gap: 8 }}>
      {shown.map((chronicle) => {
        const art = worldArt('hero', game.id, chronicle.id)
        const count = counts[chronicle.id]
        return (
          <Link
            key={chronicle.id}
            to={`/${game.slug}/${chronicle.slug}`}
            className="group relative isolate flex h-[62px] w-[132px] shrink-0 flex-col justify-end overflow-hidden rounded-xl border px-2.5 py-2 transition-all duration-200 hover:-translate-y-0.5 sm:h-[68px] sm:w-[150px]"
            style={{ borderColor: theme.colors.border, background: theme.colors.surface }}
          >
            <WorldArtSurface art={art} scrim="none" sizes="160px" width={400} zoom />
            <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(5,7,11,.9) 0%, rgba(5,7,11,.4) 60%, rgba(5,7,11,.05) 100%)' }} />
            <span className="relative truncate text-[13.5px] leading-tight font-semibold text-white">{chronicle.label}</span>
            <span className="relative truncate text-[11px] leading-tight text-white/70">
              {count.servers} {plural(count.servers, ['сервер', 'сервера', 'серверов'])}
              {count.online ? ` · ${formatCompact(count.online)}` : ''}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
