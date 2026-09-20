import type { GameTheme } from '../core/types'

/**
 * Minecraft — pixel fantasy.
 * Blocky geometry, grass / stone / wood palette, daylight hero over a dark
 * survival-night interface. Hard edges everywhere: 4px radii, no soft blur.
 */
export const minecraftTheme: GameTheme = {
  id: 'minecraft',
  label: 'Minecraft',
  mood: 'Блоки, трава и камень. Дневной свет над ночным интерфейсом',
  colors: {
    primary: '#6ABE30',
    primarySoft: 'rgba(106, 190, 48, 0.16)',
    primaryStrong: '#4F9021',
    secondary: '#8A5A34',
    secondarySoft: 'rgba(138, 90, 52, 0.18)',
    accent: '#F2C94C',
    bg: '#090F0A',
    bgDeep: '#050A06',
    surface: 'rgba(17, 28, 18, 0.94)',
    surfaceRaised: '#16241A',
    border: 'rgba(124, 201, 63, 0.16)',
    borderStrong: 'rgba(124, 201, 63, 0.38)',
    text: '#EFF6EA',
    textMuted: '#AFC2A6',
    textFaint: '#7C8E77',
  },
  gradients: {
    hero: 'linear-gradient(180deg, rgba(74,154,212,0.55) 0%, rgba(74,154,212,0.10) 42%, rgba(9,15,10,0) 70%), linear-gradient(160deg, #1E3A1B 0%, #090F0A 62%)',
    card: 'linear-gradient(150deg, rgba(106,190,48,0.14), rgba(138,90,52,0.06) 55%, rgba(0,0,0,0))',
    cta: 'linear-gradient(180deg, #7ACB3C 0%, #4F9021 100%)',
    aura: 'radial-gradient(closest-side, rgba(106,190,48,0.55), transparent)',
  },
  glow: {
    soft: '0 6px 0 -2px rgba(0,0,0,0.5), 0 14px 34px -18px rgba(0,0,0,0.9)',
    strong: '0 8px 0 -2px rgba(0,0,0,0.55), 0 24px 54px -22px rgba(106,190,48,0.35)',
    ring: '0 0 0 1px rgba(106,190,48,0.22)',
  },
  card: {
    radius: '4px',
    background: 'linear-gradient(180deg, rgba(22,36,26,0.96), rgba(12,20,14,0.96))',
    border: '1px solid rgba(124, 201, 63, 0.18)',
    shadow: 'inset 0 2px 0 rgba(255,255,255,0.07), inset 0 -2px 0 rgba(0,0,0,0.45), 0 2px 0 rgba(0,0,0,0.35)',
    shadowHover: 'inset 0 2px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.5), 0 10px 26px -14px rgba(106,190,48,0.45)',
    overlay: 'linear-gradient(to top, rgba(9,15,10,0.97) 14%, rgba(9,15,10,0.55) 58%, rgba(9,15,10,0.12))',
    frame: 'block',
  },
  button: {
    radius: '4px',
    background: 'linear-gradient(180deg, #7ACB3C 0%, #4F9021 100%)',
    backgroundHover: 'linear-gradient(180deg, #8AD94A 0%, #5BA328 100%)',
    color: '#08140A',
    border: '1px solid rgba(0,0,0,0.45)',
    shadow: 'inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -3px 0 rgba(0,0,0,0.3), 0 3px 0 rgba(0,0,0,0.4)',
    transform: 'none',
    weight: '600',
    letterSpacing: '0.01em',
  },
  badge: {
    radius: '3px',
    background: 'rgba(106, 190, 48, 0.14)',
    color: '#C6E8A8',
    border: '1px solid rgba(106, 190, 48, 0.3)',
  },
  typography: {
    display: "'Inter Tight', 'Inter', ui-sans-serif, system-ui, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    accentTransform: 'uppercase',
    accentSpacing: '0.16em',
    accentWeight: '600',
    displayScale: 1,
  },
  decor: {
    pattern: 'voxel',
    particles: 'dust',
    intensity: 0.55,
    horizon: 'blocks',
  },
}
