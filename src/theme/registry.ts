import { coreTheme } from './core/tokens'
import { mergeTheme } from './core/cssVars'
import type { ChronicleTheme, GameTheme } from './core/types'
import { minecraftTheme } from './games/minecraft'
import { lineage2Theme } from './games/lineage2'
import { gtaRpTheme } from './games/gtaRp'
import { rustTheme } from './games/rust'
import { cs2Theme } from './games/cs2'
import { interludeTheme } from './chronicles/interlude'
import { highFiveTheme } from './chronicles/highFive'
import { essenceTheme } from './chronicles/essence'

/** Hand-made worlds, keyed by `Game.id`. */
export const GAME_THEMES: Record<string, GameTheme> = {
  minecraft: minecraftTheme,
  lineage2: lineage2Theme,
  gtarp: gtaRpTheme,
  rust: rustTheme,
  cs2: cs2Theme,
}

/** Chronicle overrides, keyed by `Chronicle.themeId`. */
export const CHRONICLE_THEMES: Record<string, ChronicleTheme> = {
  'l2-interlude': interludeTheme,
  'l2-high-five': highFiveTheme,
  'l2-essence': essenceTheme,
}

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Builds a usable world for a game that has no bespoke theme file yet, from
 * the two brand colours already stored in the games dataset. New games look
 * intentional on day one and can be upgraded to a hand-made theme later.
 */
export function autoTheme(seed: { id: string; label: string; from: string; to: string; accent: string }): GameTheme {
  const { from, to, accent } = seed
  return {
    ...coreTheme,
    id: seed.id,
    label: seed.label,
    mood: 'Автоматическая тема из цветов игры',
    colors: {
      ...coreTheme.colors,
      primary: accent,
      primarySoft: rgba(accent, 0.15),
      primaryStrong: from,
      secondary: to,
      secondarySoft: rgba(to, 0.14),
      border: rgba(accent, 0.16),
      borderStrong: rgba(accent, 0.4),
    },
    gradients: {
      hero: `radial-gradient(100% 80% at 50% 0%, ${rgba(accent, 0.22)} 0%, ${rgba(accent, 0)} 55%), linear-gradient(165deg, ${rgba(from, 0.5)} 0%, ${coreTheme.colors.bg} 60%)`,
      card: `linear-gradient(150deg, ${rgba(accent, 0.12)}, ${rgba(to, 0.06)} 55%, rgba(0,0,0,0))`,
      cta: `linear-gradient(180deg, ${to} 0%, ${from} 100%)`,
      aura: `radial-gradient(closest-side, ${rgba(accent, 0.5)}, transparent)`,
    },
    glow: {
      ...coreTheme.glow,
      strong: `0 18px 46px -20px ${rgba(accent, 0.4)}`,
      ring: `0 0 0 1px ${rgba(accent, 0.25)}`,
    },
    card: {
      ...coreTheme.card,
      border: `1px solid ${rgba(accent, 0.18)}`,
      shadowHover: `inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 40px -20px ${rgba(accent, 0.4)}`,
    },
    button: {
      ...coreTheme.button,
      background: `linear-gradient(180deg, ${to} 0%, ${from} 100%)`,
      backgroundHover: `linear-gradient(180deg, ${to} 20%, ${from} 120%)`,
      color: '#0A0C10',
      shadow: `0 10px 26px -14px ${rgba(accent, 0.55)}`,
    },
    badge: {
      ...coreTheme.badge,
      background: rgba(accent, 0.12),
      color: accent,
      border: `1px solid ${rgba(accent, 0.3)}`,
    },
  }
}

/**
 * Resolves the visual world for a game + optional chronicle.
 * Chronicle themes are partial and are merged over their parent game theme.
 */
export function resolveTheme(options: {
  gameId?: string
  chronicleThemeId?: string
  /** fallback brand colours when the game has no bespoke theme */
  seed?: { label: string; from: string; to: string; accent: string }
}): GameTheme {
  const { gameId, chronicleThemeId, seed } = options

  const base =
    (gameId ? GAME_THEMES[gameId] : undefined) ??
    (gameId && seed ? autoTheme({ id: gameId, ...seed }) : coreTheme)

  if (!chronicleThemeId) return base

  const chronicle = CHRONICLE_THEMES[chronicleThemeId]
  if (!chronicle) return base

  const parent = GAME_THEMES[chronicle.parent] ?? base
  return mergeTheme(parent, chronicle)
}

export { coreTheme }
