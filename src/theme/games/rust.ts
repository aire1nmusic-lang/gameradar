import type { GameTheme } from '../core/types'

/**
 * Rust — corroded industrial.
 * Metal plates, rivets, dust. Warm corrosion orange against cold scrap grey.
 */
export const rustTheme: GameTheme = {
  id: 'rust',
  label: 'Rust',
  mood: 'Ржавый металл, пыль и следы рейдов',
  colors: {
    primary: '#D0703C',
    primarySoft: 'rgba(208, 112, 60, 0.16)',
    primaryStrong: '#A8522A',
    secondary: '#9AA38E',
    secondarySoft: 'rgba(154, 163, 142, 0.14)',
    accent: '#E8C07A',
    bg: '#0C0A08',
    bgDeep: '#070605',
    surface: 'rgba(22, 18, 16, 0.94)',
    surfaceRaised: '#1C1714',
    border: 'rgba(208, 112, 60, 0.18)',
    borderStrong: 'rgba(208, 112, 60, 0.42)',
    text: '#F0EAE3',
    textMuted: '#BCB1A6',
    textFaint: '#877D73',
  },
  gradients: {
    hero: 'radial-gradient(100% 80% at 20% 0%, rgba(208,112,60,0.25) 0%, rgba(208,112,60,0) 55%), linear-gradient(165deg, #2A1B12 0%, #0C0A08 60%)',
    card: 'linear-gradient(150deg, rgba(208,112,60,0.13), rgba(154,163,142,0.06) 55%, rgba(0,0,0,0))',
    cta: 'linear-gradient(180deg, #DE8049 0%, #A8522A 100%)',
    aura: 'radial-gradient(closest-side, rgba(208,112,60,0.5), transparent)',
  },
  glow: {
    soft: '0 8px 26px -14px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
    strong: '0 20px 48px -22px rgba(208,112,60,0.45)',
    ring: '0 0 0 1px rgba(208,112,60,0.25)',
  },
  card: {
    radius: '6px',
    background: 'linear-gradient(180deg, rgba(28,23,20,0.96), rgba(14,12,10,0.97))',
    border: '1px solid rgba(208, 112, 60, 0.2)',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.65)',
    shadowHover: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 16px 40px -20px rgba(208,112,60,0.4)',
    overlay: 'linear-gradient(to top, rgba(12,10,8,0.97) 14%, rgba(12,10,8,0.58) 58%, rgba(12,10,8,0.12))',
    frame: 'plated',
  },
  button: {
    radius: '5px',
    background: 'linear-gradient(180deg, #DE8049 0%, #A8522A 100%)',
    backgroundHover: 'linear-gradient(180deg, #EB9159 0%, #BB6032 100%)',
    color: '#150D08',
    border: '1px solid rgba(0,0,0,0.45)',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 8px 22px -12px rgba(208,112,60,0.5)',
    transform: 'uppercase',
    weight: '600',
    letterSpacing: '0.07em',
  },
  badge: {
    radius: '4px',
    background: 'rgba(208, 112, 60, 0.13)',
    color: '#EBB98C',
    border: '1px solid rgba(208, 112, 60, 0.32)',
  },
  typography: {
    display: "'Inter Tight', 'Inter', ui-sans-serif, system-ui, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    accentTransform: 'uppercase',
    accentSpacing: '0.18em',
    accentWeight: '600',
    displayScale: 1,
  },
  decor: {
    pattern: 'rust',
    particles: 'dust',
    intensity: 0.5,
    horizon: 'ruins',
  },
}
