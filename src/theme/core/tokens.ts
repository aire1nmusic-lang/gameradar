import type { GameTheme } from './types'

/**
 * The neutral GameRadar shell.
 *
 * Every game theme starts from these values, so a new theme only has to
 * describe what makes it different. This is also the theme used outside of
 * game worlds (home, catalog, dashboard), which keeps the platform coherent.
 */
export const coreTheme: GameTheme = {
  id: 'core',
  label: 'GameRadar',
  mood: 'Нейтральная платформенная тема',
  colors: {
    primary: '#2ee0a6',
    primarySoft: 'rgba(46, 224, 166, 0.14)',
    primaryStrong: '#14c98e',
    secondary: '#9a8cff',
    secondarySoft: 'rgba(154, 140, 255, 0.14)',
    accent: '#f4f6fa',
    bg: '#08090d',
    bgDeep: '#05060a',
    surface: 'rgba(16, 19, 25, 0.92)',
    surfaceRaised: '#14171f',
    border: 'rgba(255, 255, 255, 0.07)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',
    text: '#f4f6fa',
    textMuted: '#b4bccb',
    textFaint: '#838da1',
  },
  gradients: {
    hero: 'linear-gradient(135deg, #14171f 0%, #08090d 60%)',
    card: 'linear-gradient(150deg, rgba(255,255,255,0.05), rgba(255,255,255,0))',
    cta: 'linear-gradient(180deg, #ffffff, #dde2ec)',
    aura: 'radial-gradient(closest-side, rgba(46,224,166,0.5), transparent)',
  },
  glow: {
    soft: '0 8px 30px -12px rgba(0, 0, 0, 0.8)',
    strong: '0 18px 50px -20px rgba(0, 0, 0, 0.9)',
    ring: '0 0 0 1px rgba(255, 255, 255, 0.08)',
  },
  card: {
    radius: '14px',
    background: 'rgba(16, 19, 25, 0.92)',
    border: '1px solid rgba(255, 255, 255, 0.07)',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.4)',
    shadowHover: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 40px -18px rgba(0,0,0,0.9)',
    overlay: 'linear-gradient(to top, rgba(8,9,13,0.96) 12%, rgba(8,9,13,0.55) 55%, rgba(8,9,13,0.15))',
    frame: 'soft',
  },
  button: {
    radius: '10px',
    background: '#ffffff',
    backgroundHover: '#dde2ec',
    color: '#08090d',
    border: '1px solid transparent',
    shadow: '0 8px 24px -12px rgba(255,255,255,0.35)',
    transform: 'none',
    weight: '500',
    letterSpacing: '0',
  },
  badge: {
    radius: '999px',
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#b4bccb',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  typography: {
    display: "'Inter Tight', 'Inter', ui-sans-serif, system-ui, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    accentTransform: 'uppercase',
    accentSpacing: '0.14em',
    accentWeight: '500',
    displayScale: 1,
  },
  decor: {
    pattern: 'plain',
    particles: 'none',
    intensity: 0.3,
    horizon: 'none',
  },
}
