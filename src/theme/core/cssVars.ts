import type { CSSProperties } from 'react'
import type { ChronicleTheme, GameTheme } from './types'

/**
 * Themes are applied as CSS custom properties on a wrapper element, so the
 * themed world is scoped to its subtree and the neutral platform shell around
 * it is untouched. No runtime style injection, no class explosion.
 */
export function themeToCssVars(theme: GameTheme): CSSProperties {
  const { colors: c, gradients: g, glow, card, button: b, badge, typography: t } = theme

  return {
    '--gt-primary': c.primary,
    '--gt-primary-soft': c.primarySoft,
    '--gt-primary-strong': c.primaryStrong,
    '--gt-secondary': c.secondary,
    '--gt-secondary-soft': c.secondarySoft,
    '--gt-accent': c.accent,
    '--gt-bg': c.bg,
    '--gt-bg-deep': c.bgDeep,
    '--gt-surface': c.surface,
    '--gt-surface-raised': c.surfaceRaised,
    '--gt-border': c.border,
    '--gt-border-strong': c.borderStrong,
    '--gt-text': c.text,
    '--gt-text-muted': c.textMuted,
    '--gt-text-faint': c.textFaint,

    '--gt-grad-hero': g.hero,
    '--gt-grad-card': g.card,
    '--gt-grad-cta': g.cta,
    '--gt-grad-aura': g.aura,

    '--gt-glow-soft': glow.soft,
    '--gt-glow-strong': glow.strong,
    '--gt-ring': glow.ring,

    '--gt-card-radius': card.radius,
    '--gt-card-bg': card.background,
    '--gt-card-border': card.border,
    '--gt-card-shadow': card.shadow,
    '--gt-card-shadow-hover': card.shadowHover,
    '--gt-card-overlay': card.overlay,

    '--gt-btn-radius': b.radius,
    '--gt-btn-bg': b.background,
    '--gt-btn-bg-hover': b.backgroundHover,
    '--gt-btn-color': b.color,
    '--gt-btn-border': b.border,
    '--gt-btn-shadow': b.shadow,
    '--gt-btn-transform': b.transform,
    '--gt-btn-weight': b.weight,
    '--gt-btn-spacing': b.letterSpacing,

    '--gt-badge-radius': badge.radius,
    '--gt-badge-bg': badge.background,
    '--gt-badge-color': badge.color,
    '--gt-badge-border': badge.border,

    '--gt-font-display': t.display,
    '--gt-font-body': t.body,
    '--gt-accent-transform': t.accentTransform,
    '--gt-accent-spacing': t.accentSpacing,
    '--gt-accent-weight': t.accentWeight,
  } as CSSProperties
}

/** Merge a chronicle's partial overrides over its parent game theme. */
export function mergeTheme(base: GameTheme, override: ChronicleTheme): GameTheme {
  return {
    id: override.id,
    label: override.label,
    mood: override.mood,
    colors: { ...base.colors, ...override.colors },
    gradients: { ...base.gradients, ...override.gradients },
    glow: { ...base.glow, ...override.glow },
    card: { ...base.card, ...override.card },
    button: { ...base.button, ...override.button },
    badge: { ...base.badge, ...override.badge },
    typography: { ...base.typography, ...override.typography },
    decor: { ...base.decor, ...override.decor },
  }
}
