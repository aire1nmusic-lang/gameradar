import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { formatCompact } from '@/lib/format'
import type { Chronicle, Game } from '@/models'
import { useGameTheme } from '@/theme'
import { worldArt } from '@/data/themeMedia'
import { ArtImage } from '@/components/media/WorldArt'

/**
 * Chronicle switcher. Each entry is its own route (and often its own theme),
 * so switching Interlude → High Five repaints the whole world.
 */
export function ChronicleNav({ game, chronicles }: { game: Game; chronicles: Chronicle[] }) {
  const theme = useGameTheme()
  if (chronicles.length === 0) return null

  const item = (active: boolean) =>
    cn(
      'inline-flex shrink-0 items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-1.5 text-[13px] transition-all duration-200',
      active ? 'shadow-[var(--gt-glow-soft)]' : 'hover:-translate-y-0.5',
    )

  /** A chronicle with its own art gets a thumbnail — the difference is visible before the click. */
  const thumb = (chronicleId?: string) => {
    const art = worldArt('hero', game.id, chronicleId)
    if (!art) return <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: theme.colors.primarySoft }} />
    return (
      <span
        className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full"
        style={{ boxShadow: `inset 0 0 0 1px ${theme.colors.border}` }}
      >
        <ArtImage art={art} sizes="24px" width={400} />
      </span>
    )
  }

  return (
    <div className="rail -mx-5 scroll-pl-5 px-5 sm:mx-0 sm:scroll-pl-0 sm:flex-wrap sm:px-0">
      <NavLink
        to={`/${game.slug}`}
        end
        className={({ isActive }) => item(isActive)}
        style={({ isActive }) => ({
          borderColor: isActive ? theme.colors.primary : theme.colors.border,
          background: isActive ? theme.colors.primarySoft : 'transparent',
          color: isActive ? theme.colors.text : theme.colors.textMuted,
        })}
      >
        {thumb(undefined)}
        Все серверы
      </NavLink>

      {chronicles.map((chronicle) => (
        <NavLink
          key={chronicle.id}
          to={`/${game.slug}/${chronicle.slug}`}
          className={({ isActive }) => item(isActive)}
          style={({ isActive }) => ({
            borderColor: isActive ? theme.colors.primary : theme.colors.border,
            background: isActive ? theme.colors.primarySoft : 'transparent',
            color: isActive ? theme.colors.text : theme.colors.textMuted,
          })}
        >
          {thumb(chronicle.id)}
          {chronicle.label}
          {chronicle.playersOnline > 0 && <span className="num text-[11.5px] opacity-70">{formatCompact(chronicle.playersOnline)}</span>}
        </NavLink>
      ))}
    </div>
  )
}
