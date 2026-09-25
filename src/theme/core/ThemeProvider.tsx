import { createContext, use, useMemo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useAppearance, type Surface } from '../appearance'
import { coreTheme } from './tokens'
import { themeToCssVars } from './cssVars'
import type { GameTheme } from './types'

const ThemeContext = createContext<GameTheme>(coreTheme)

/**
 * How far each background surface moves toward a tint for the lighter
 * "surface" choices. Night keeps the worlds exactly as designed.
 */
const LIFT: Partial<Record<Surface, { tint: string; bg: number; bgDeep: number; surface: number; surfaceRaised: number }>> = {
  graphite: { tint: '#5a6478', bg: 26, bgDeep: 22, surface: 24, surfaceRaised: 26 },
  dusk: { tint: '#4a3aa8', bg: 26, bgDeep: 22, surface: 24, surfaceRaised: 26 },
}

const liftCache = new WeakMap<GameTheme, Map<Surface, GameTheme>>()

/** The same world, its backgrounds mixed toward the chosen surface tint. */
export function liftTheme(theme: GameTheme, surface: Surface): GameTheme {
  const lift = LIFT[surface]
  if (!lift) return theme
  let byTheme = liftCache.get(theme)
  if (!byTheme) liftCache.set(theme, (byTheme = new Map()))
  const cached = byTheme.get(surface)
  if (cached) return cached
  const c = theme.colors
  const mix = (color: string, amount: number) => `color-mix(in oklab, ${color}, ${lift.tint} ${amount}%)`
  const lifted: GameTheme = {
    ...theme,
    colors: {
      ...c,
      bg: mix(c.bg, lift.bg),
      bgDeep: mix(c.bgDeep, lift.bgDeep),
      surface: mix(c.surface, lift.surface),
      surfaceRaised: mix(c.surfaceRaised, lift.surfaceRaised),
    },
  }
  byTheme.set(surface, lifted)
  return lifted
}

/** Current game theme. Outside a themed world this is the neutral core theme. */
export function useGameTheme(): GameTheme {
  const theme = use(ThemeContext)
  const { appearance } = useAppearance()
  // Scopes publish an already-lifted theme; only the neutral default is lifted here.
  return theme === coreTheme ? liftTheme(coreTheme, appearance.surface) : theme
}

/**
 * Applies a theme to its subtree: publishes the CSS variables and exposes the
 * theme object to components that need non-CSS values (decor pattern, horizon).
 */
export function ThemeScope({
  theme,
  children,
  className,
  as: Tag = 'div',
}: {
  theme: GameTheme
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'main' | 'article'
}) {
  const { appearance } = useAppearance()
  const lifted = useMemo(() => liftTheme(theme, appearance.surface), [theme, appearance.surface])
  return (
    <ThemeContext value={lifted}>
      <Tag
        data-theme={theme.id}
        data-pattern={theme.decor.pattern}
        style={themeToCssVars(lifted)}
        className={cn('gt-scope', className)}
      >
        {children}
      </Tag>
    </ThemeContext>
  )
}
