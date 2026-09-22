/**
 * GameScout Theme Engine — type contracts.
 *
 * A theme is plain data. It never imports React and never touches the DOM,
 * so themes can later be delivered from an API without changing a component.
 *
 * Layering:
 *   core tokens  →  game theme  →  chronicle theme (partial override)
 */

export type DecorPattern =
  | 'voxel'      // Minecraft — blocks, pixel grid
  | 'stone'      // Lineage 2 — carved stone, runes
  | 'neon'       // GTA RP — neon grid, city haze
  | 'rust'       // Rust — corroded plates, rivets
  | 'tactical'   // CS2 — crosshairs, technical grid
  | 'plain'      // core / neutral shell

export type FrameKind = 'soft' | 'carved' | 'plated' | 'chamfer' | 'block'

export type ParticleKind = 'none' | 'dust' | 'embers' | 'rain' | 'sparks'

export interface ThemeColors {
  /** main identity colour — headings, active states, key accents */
  primary: string
  primarySoft: string
  primaryStrong: string
  /** supporting identity colour — secondary accents, gradients */
  secondary: string
  secondarySoft: string
  /** high-contrast highlight used sparingly (numbers, badges) */
  accent: string
  /** page background of the themed world */
  bg: string
  bgDeep: string
  /** card / panel fills */
  surface: string
  surfaceRaised: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textFaint: string
}

export interface ThemeGradients {
  /** big hero banner background */
  hero: string
  /** card art background */
  card: string
  /** primary call-to-action fill */
  cta: string
  /** ambient glow blob behind sections */
  aura: string
}

export interface ThemeGlow {
  soft: string
  strong: string
  ring: string
}

export interface ThemeCardStyle {
  radius: string
  background: string
  border: string
  shadow: string
  shadowHover: string
  /** overlay painted above the card art so text stays readable */
  overlay: string
  frame: FrameKind
}

export interface ThemeButtonStyle {
  radius: string
  background: string
  backgroundHover: string
  color: string
  border: string
  shadow: string
  /** uppercase / letter-spacing treatment for the label */
  transform: 'none' | 'uppercase'
  weight: string
  letterSpacing: string
}

export interface ThemeBadgeStyle {
  radius: string
  background: string
  color: string
  border: string
}

export interface ThemeTypography {
  display: string
  body: string
  /** styling for small eyebrow / label text inside the themed world */
  accentTransform: 'none' | 'uppercase'
  accentSpacing: string
  accentWeight: string
  /** headline scale multiplier — lets epic worlds shout a little louder */
  displayScale: number
}

export interface ThemeDecor {
  pattern: DecorPattern
  particles: ParticleKind
  /** 0 – 1, how present the decorative layer is */
  intensity: number
  /** silhouette drawn at the bottom of the hero */
  horizon: 'blocks' | 'towers' | 'city' | 'ruins' | 'none'
}

export interface GameTheme {
  id: string
  label: string
  /** one-line description of the visual world, shown in the theme switcher */
  mood: string
  colors: ThemeColors
  gradients: ThemeGradients
  glow: ThemeGlow
  card: ThemeCardStyle
  button: ThemeButtonStyle
  badge: ThemeBadgeStyle
  typography: ThemeTypography
  decor: ThemeDecor
}

/** A chronicle theme only overrides what makes it different from its game. */
export interface ChronicleTheme {
  id: string
  label: string
  mood: string
  /** theme id of the game this chronicle belongs to */
  parent: string
  colors?: Partial<ThemeColors>
  gradients?: Partial<ThemeGradients>
  glow?: Partial<ThemeGlow>
  card?: Partial<ThemeCardStyle>
  button?: Partial<ThemeButtonStyle>
  badge?: Partial<ThemeBadgeStyle>
  typography?: Partial<ThemeTypography>
  decor?: Partial<ThemeDecor>
}
