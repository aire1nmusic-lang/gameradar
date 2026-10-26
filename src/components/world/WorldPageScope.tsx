import type { CSSProperties, ReactNode } from 'react'
import { ThemeScope } from '@/theme'
import { themeForGame } from '@/data/themes'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'
import { useAppearance } from '@/theme/appearance'
import { lightWorldTheme } from '@/theme/lightWorld'
import { cn } from '@/lib/utils'
import './lineage-discovery.css'

function platformPalette(theme: ReturnType<typeof themeForGame>): CSSProperties {
  const c=theme.colors
  return {
    '--color-ink-1000': c.bgDeep,
    '--color-ink-950': c.bg,
    '--color-ink-900': c.surface,
    '--color-ink-850': c.surface,
    '--color-ink-800': c.surfaceRaised,
    '--color-ink-750': `color-mix(in oklab, ${c.surfaceRaised}, ${c.text} 9%)`,
    '--color-ink-700': `color-mix(in oklab, ${c.surfaceRaised}, ${c.text} 16%)`,
    '--color-ink-600': `color-mix(in oklab, ${c.textFaint}, ${c.text} 12%)`,
    '--color-ink-500': c.textFaint,
    '--color-ink-400': c.textMuted,
    '--color-ink-300': c.textMuted,
    '--color-ink-200': c.text,
    '--color-ink-100': c.text,
    '--color-ink-50': c.text,
    '--color-signal-400': c.primary,
    '--color-signal-500': c.primaryStrong,
    '--color-promo-400': c.secondary,
    '--color-promo-500': c.secondary,
  } as CSSProperties
}

/**
 * Keeps utility routes (catalog, openings, rating, favorites) inside the same
 * visual world instead of dropping back to the neutral platform between clicks.
 */
export function WorldPageScope({children,className}:{children:ReactNode;className?:string}) {
  const {game}=useWorldNavigation()
  const {colorMode}=useAppearance()
  if(!game)return <div className={className}>{children}</div>

  const base=themeForGame(game.id)
  const theme=colorMode==='light'?lightWorldTheme(base):base

  return <ThemeScope theme={theme} as="div" className={cn('gs-world-utility','gs-l2-utility',colorMode==='light'&&'gs-world-light')}>
    <div
      className={cn('min-h-[calc(100vh-60px)]',className)}
      style={{...platformPalette(theme),background:theme.colors.bg,color:theme.colors.text}}
    >
      {children}
    </div>
  </ThemeScope>
}
