/** Public surface of the Theme Engine. */
export type {
  ChronicleTheme,
  DecorPattern,
  FrameKind,
  GameTheme,
  ParticleKind,
  ThemeBadgeStyle,
  ThemeButtonStyle,
  ThemeCardStyle,
  ThemeColors,
  ThemeDecor,
  ThemeGlow,
  ThemeGradients,
  ThemeTypography,
} from './core/types'

export { coreTheme } from './core/tokens'
export { themeToCssVars, mergeTheme } from './core/cssVars'
export { ThemeScope, useGameTheme, liftTheme } from './core/ThemeProvider'
export { AppearanceProvider, useAppearance, APPEARANCE_OPTIONS, APPEARANCE_DEFAULTS } from './appearance'
export type { Appearance, Surface, HeroSize, Motion, IconStyle, LogoMode } from './appearance'
export { ThemeAura, ThemeFrame, ThemeHorizon, ThemeParticles, ThemePattern } from './core/Decor'
export {
  ThemedBadge,
  ThemedButton,
  ThemedCard,
  ThemedDivider,
  ThemedEyebrow,
  ThemedHeading,
  ThemedPanel,
} from './core/components'
export { GAME_THEMES, CHRONICLE_THEMES, autoTheme, resolveTheme } from './registry'
