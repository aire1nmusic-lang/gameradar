import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { formatCompact, formatNumber, plural } from '@/lib/format'
import { worldArt } from '@/data/themeMedia'
import type { Chronicle, Game } from '@/models'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { useGameTheme } from '@/theme'

/**
 * The entry points of a world as pictures — chronicles of Lineage 2, modes of Minecraft.
 * A player sees the difference before the click, the way a genre shelf works on a store.
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
    <div className={cn('rail -mx-5 scroll-pl-5 px-5 sm:mx-0 sm:scroll-pl-0 sm:px-0', className)} style={{ gap: 10 }}>
      {shown.map((chronicle) => {
        const art = worldArt('hero', game.id, chronicle.id)
        const count = counts[chronicle.id]
        return (
          <Link
            key={chronicle.id}
            to={`/${game.slug}/${chronicle.slug}`}
            className="group relative isolate flex h-[104px] w-[148px] shrink-0 flex-col justify-end overflow-hidden rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-0.5 sm:h-[112px] sm:w-[172px]"
            style={{ borderColor: theme.colors.border, background: theme.colors.surface }}
          >
            <WorldArtSurface art={art} scrim="none" sizes="200px" width={400} zoom />
            <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(5,7,11,.92) 0%, rgba(5,7,11,.45) 55%, rgba(5,7,11,.05) 100%)' }} />
            <span className="relative text-[15px] leading-tight font-semibold text-white">{chronicle.label}</span>
            <span className="relative mt-0.5 text-[11.5px] text-white/70">
              {count?.servers ? `${formatNumber(count.servers)} ${plural(count.servers, ['сервер', 'сервера', 'серверов'])}` : 'пока пусто'}
              {count?.online ? ` · ${formatCompact(count.online)} онлайн` : ''}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
