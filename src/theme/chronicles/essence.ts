import type { ChronicleTheme } from '../core/types'

/**
 * Essence — modern arcane.
 * The contemporary chronicle: violet and teal, cleaner geometry, softer
 * radii, sparks instead of embers. Reads newer than classic Lineage 2.
 */
export const essenceTheme: ChronicleTheme = {
  id: 'l2-essence',
  parent: 'lineage2',
  label: 'Essence',
  mood: 'Современная магия: аметист и бирюза',
  colors: {
    primary: '#A98BF5',
    primarySoft: 'rgba(169, 139, 245, 0.15)',
    primaryStrong: '#7E5FD6',
    secondary: '#46D7C6',
    secondarySoft: 'rgba(70, 215, 198, 0.14)',
    accent: '#EFE9FF',
    bg: '#08070E',
    bgDeep: '#050409',
    surface: 'rgba(19, 16, 30, 0.94)',
    surfaceRaised: '#181427',
    border: 'rgba(169, 139, 245, 0.18)',
    borderStrong: 'rgba(169, 139, 245, 0.45)',
    text: '#F0ECFA',
    textMuted: '#BDB4D4',
    textFaint: '#857BA0',
  },
  gradients: {
    hero: 'radial-gradient(110% 85% at 50% 0%, rgba(169,139,245,0.26) 0%, rgba(169,139,245,0) 55%), radial-gradient(70% 60% at 15% 25%, rgba(70,215,198,0.18) 0%, rgba(70,215,198,0) 60%), linear-gradient(170deg, #1C1436 0%, #08070E 60%)',
    card: 'linear-gradient(155deg, rgba(169,139,245,0.14), rgba(70,215,198,0.07) 52%, rgba(0,0,0,0))',
    cta: 'linear-gradient(100deg, #A98BF5 0%, #6E56D8 100%)',
    aura: 'radial-gradient(closest-side, rgba(169,139,245,0.5), transparent)',
  },
  glow: {
    soft: '0 10px 36px -16px rgba(169,139,245,0.45), 0 2px 10px rgba(0,0,0,0.65)',
    strong: '0 0 42px -10px rgba(169,139,245,0.5), 0 0 64px -24px rgba(70,215,198,0.4)',
    ring: '0 0 0 1px rgba(169,139,245,0.3)',
  },
  card: {
    radius: '12px',
    border: '1px solid rgba(169, 139, 245, 0.2)',
    background: 'linear-gradient(180deg, rgba(24,20,39,0.95), rgba(12,10,20,0.96))',
    shadowHover:
      'inset 0 1px 0 rgba(169,139,245,0.3), 0 0 32px -12px rgba(169,139,245,0.5), 0 18px 44px -22px rgba(0,0,0,0.95)',
    frame: 'soft',
  },
  button: {
    radius: '10px',
    background: 'linear-gradient(100deg, #A98BF5 0%, #6E56D8 100%)',
    backgroundHover: 'linear-gradient(100deg, #BCA2FF 0%, #8069E8 100%)',
    color: '#0D0819',
    border: '1px solid rgba(239, 233, 255, 0.28)',
    shadow: '0 12px 30px -14px rgba(169,139,245,0.65)',
    letterSpacing: '0.06em',
  },
  badge: {
    radius: '999px',
    background: 'rgba(70, 215, 198, 0.12)',
    color: '#A8ECE2',
    border: '1px solid rgba(70, 215, 198, 0.3)',
  },
  typography: {
    display: "'Inter Tight', 'Inter', ui-sans-serif, system-ui, sans-serif",
    displayScale: 1,
    accentSpacing: '0.16em',
  },
  decor: {
    particles: 'sparks',
    intensity: 0.5,
    horizon: 'towers',
  },
}
