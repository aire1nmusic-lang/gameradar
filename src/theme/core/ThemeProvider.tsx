import { createContext, use, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { coreTheme } from './tokens'
import { themeToCssVars } from './cssVars'
import type { GameTheme } from './types'

const ThemeContext = createContext<GameTheme>(coreTheme)

/** Current game theme. Outside a themed world this is the neutral core theme. */
export function useGameTheme(): GameTheme {
  return use(ThemeContext)
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
  return (
    <ThemeContext value={theme}>
      <Tag
        data-theme={theme.id}
        data-pattern={theme.decor.pattern}
        style={themeToCssVars(theme)}
        className={cn('gt-scope', className)}
      >
        {children}
      </Tag>
    </ThemeContext>
  )
}
