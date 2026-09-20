import type { GameTheme } from '../core/types'

/**
 * Counter-Strike 2 — tactical.
 * Graphite panels, technical grid, a single warm signal orange. Tight radii,
 * monospace accents, nothing decorative that could distract from data.
 */
export const cs2Theme: GameTheme = {
  id: 'cs2',
  label: 'CS2',
  mood: 'Тактический интерфейс, графит и сигнальный оранжевый',
  colors: {
    primary: '#E8A33D',
    primarySoft: 'rgba(232, 163, 61, 0.15)',
    primaryStrong: '#C4821F',
    secondary: '#4D8FD1',
    secondarySoft: 'rgba(77, 143, 209, 0.14)',
    accent: '#F2F5F8',
    bg: '#0A0B0D',
    bgDeep: '#060708',
    surface: 'rgba(20, 22, 26, 0.94)',
    surfaceRaised: '#181B20',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(232, 163, 61, 0.4)',
    text: '#F2F5F8',
    textMuted: '#B0B8C2',
    textFaint: '#7C8590',
  },
  gradients: {
    hero: 'radial-gradient(90% 80% at 75% 0%, rgba(232,163,61,0.2) 0%, rgba(232,163,61,0) 55%), linear-gradient(165deg, #1A1E24 0%, #0A0B0D 58%)',
    card: 'linear-gradient(150deg, rgba(232,163,61,0.1), rgba(77,143,209,0.07) 55%, rgba(0,0,0,0))',
    cta: 'linear-gradient(180deg, #F0AE4C 0%, #C4821F 100%)',
    aura: 'radial-gradient(closest-side, rgba(232,163,61,0.45), transparent)',
  },
  glow: {
    soft: '0 8px 26px -14px rgba(0,0,0,0.85)',
    strong: '0 18px 44px -20px rgba(232,163,61,0.4)',
    ring: '0 0 0 1px rgba(232,163,61,0.25)',
  },
  card: {
    radius: '4px',
    background: 'linear-gradient(180deg, rgba(24,27,32,0.96), rgba(12,14,17,0.97))',
    border: '1px solid rgba(255, 255, 255, 0.09)',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 10px rgba(0,0,0,0.6)',
    shadowHover: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 14px 36px -18px rgba(232,163,61,0.35)',
    overlay: 'linear-gradient(to top, rgba(10,11,13,0.97) 12%, rgba(10,11,13,0.55) 56%, rgba(10,11,13,0.1))',
    frame: 'chamfer',
  },
  button: {
    radius: '4px',
    background: 'linear-gradient(180deg, #F0AE4C 0%, #C4821F 100%)',
    backgroundHover: 'linear-gradient(180deg, #FFBF63 0%, #D9932A 100%)',
    color: '#120D05',
    border: '1px solid rgba(0,0,0,0.4)',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 20px -12px rgba(232,163,61,0.5)',
    transform: 'uppercase',
    weight: '600',
    letterSpacing: '0.09em',
  },
  badge: {
    radius: '3px',
    background: 'rgba(232, 163, 61, 0.12)',
    color: '#F3C98B',
    border: '1px solid rgba(232, 163, 61, 0.3)',
  },
  typography: {
    display: "'Inter Tight', 'Inter', ui-sans-serif, system-ui, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    accentTransform: 'uppercase',
    accentSpacing: '0.2em',
    accentWeight: '600',
    displayScale: 0.98,
  },
  decor: {
    pattern: 'tactical',
    particles: 'none',
    intensity: 0.4,
    horizon: 'none',
  },
}
