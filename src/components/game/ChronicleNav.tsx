import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { formatCompact } from '@/lib/format'
import type { Chronicle, Game } from '@/data/types'
import { useGameTheme } from '@/theme'

/**
 * Chronicle switcher. Each entry is its own route (and often its own theme),
 * so switching Interlude → High Five repaints the whole world.
 */
export function ChronicleNav({ game, chronicles }: { game: Game; chronicles: Chronicle[] }) {
  const theme = useGameTheme()
  if (chronicles.length === 0) return null

  const item = (active: boolean) =>
    cn(
      'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] transition-all duration-200',
      active ? 'shadow-[var(--gt-glow-soft)]' : 'hover:-translate-y-0.5',
    )

  return (
    <div className="rail -mx-5 px-5 sm:mx-0 sm:flex-wrap sm:px-0">
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
          {chronicle.label}
          <span className="num font-mono text-[11px] opacity-60">{formatCompact(chronicle.playersOnline)}</span>
          {chronicle.themeId && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              title="У хроники собственная тема оформления"
              style={{ background: theme.colors.primary }}
            />
          )}
        </NavLink>
      ))}
    </div>
  )
}
