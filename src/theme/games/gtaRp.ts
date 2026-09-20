import type { GameTheme } from '../core/types'

/**
 * GTA RP — neon city.
 * Wet asphalt purple-black, two neon signals (pink / cyan), chamfered cards
 * and a condensed display face. Modern street UI, not arcade neon.
 */
export const gtaRpTheme: GameTheme = {
  id: 'gtarp',
  label: 'GTA RP',
  mood: 'Ночной город, неон и мокрый асфальт',
  colors: {
    primary: '#FF5C8A',
    primarySoft: 'rgba(255, 92, 138, 0.15)',
    primaryStrong: '#E03A6D',
    secondary: '#37D6FF',
    secondarySoft: 'rgba(55, 214, 255, 0.14)',
    accent: '#FFD45C',
    bg: '#0A0812',
    bgDeep: '#06050C',
    surface: 'rgba(19, 16, 30, 0.93)',
    surfaceRaised: '#171327',
    border: 'rgba(255, 92, 138, 0.16)',
    borderStrong: 'rgba(55, 214, 255, 0.4)',
    text: '#F4F1FA',
    textMuted: '#B9B1CE',
    textFaint: '#7F779A',
  },
  gradients: {
    hero: 'radial-gradient(90% 80% at 80% 10%, rgba(255,92,138,0.28) 0%, rgba(255,92,138,0) 55%), radial-gradient(70% 70% at 12% 20%, rgba(55,214,255,0.22) 0%, rgba(55,214,255,0) 60%), linear-gradient(165deg, #241335 0%, #0A0812 60%)',
    card: 'linear-gradient(150deg, rgba(255,92,138,0.14), rgba(55,214,255,0.08) 55%, rgba(0,0,0,0))',
    cta: 'linear-gradient(100deg, #FF5C8A 0%, #A14BF5 100%)',
    aura: 'radial-gradient(closest-side, rgba(255,92,138,0.5), transparent)',
  },
  glow: {
    soft: '0 10px 34px -16px rgba(255,92,138,0.5), 0 2px 12px rgba(0,0,0,0.6)',
    strong: '0 0 38px -8px rgba(255,92,138,0.55), 0 0 60px -20px rgba(55,214,255,0.45)',
    ring: '0 0 0 1px rgba(255,92,138,0.3)',
  },
  card: {
    radius: '12px',
    background: 'linear-gradient(180deg, rgba(23,19,39,0.95), rgba(12,10,20,0.96))',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 14px rgba(0,0,0,0.6)',
    shadowHover: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 30px -12px rgba(255,92,138,0.6), 0 18px 46px -22px rgba(0,0,0,0.95)',
    overlay: 'linear-gradient(to top, rgba(10,8,18,0.96) 12%, rgba(10,8,18,0.55) 56%, rgba(10,8,18,0.1))',
    frame: 'chamfer',
  },
  button: {
    radius: '8px',
    background: 'linear-gradient(100deg, #FF5C8A 0%, #A14BF5 100%)',
    backgroundHover: 'linear-gradient(100deg, #FF7AA1 0%, #B361FF 100%)',
    color: '#0C0714',
    border: '1px solid rgba(255,255,255,0.18)',
    shadow: '0 10px 30px -12px rgba(255,92,138,0.65)',
    transform: 'uppercase',
    weight: '600',
    letterSpacing: '0.06em',
  },
  badge: {
    radius: '5px',
    background: 'rgba(55, 214, 255, 0.12)',
    color: '#9BE9FF',
    border: '1px solid rgba(55, 214, 255, 0.3)',
  },
  typography: {
    display: "'Bahnschrift', 'Archivo Narrow', 'Inter Tight', 'Inter', sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    accentTransform: 'uppercase',
    accentSpacing: '0.18em',
    accentWeight: '600',
    displayScale: 1.04,
  },
  decor: {
    pattern: 'neon',
    particles: 'rain',
    intensity: 0.5,
    horizon: 'city',
  },
}
