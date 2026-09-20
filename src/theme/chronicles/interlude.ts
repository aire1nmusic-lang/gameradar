import type { ChronicleTheme } from '../core/types'

/**
 * Interlude — cold steel.
 * Gold steps back, silver and night blue take over. Sparser glow, colder
 * stone. The chronicle only overrides what differs from Lineage 2.
 */
export const interludeTheme: ChronicleTheme = {
  id: 'l2-interlude',
  parent: 'lineage2',
  label: 'Interlude',
  mood: 'Холодная сталь, серебро и ночное небо',
  colors: {
    primary: '#B9C7D6',
    primarySoft: 'rgba(185, 199, 214, 0.13)',
    primaryStrong: '#8FA3B8',
    secondary: '#5E7FA8',
    secondarySoft: 'rgba(94, 127, 168, 0.16)',
    accent: '#E6EEF6',
    bg: '#06080C',
    bgDeep: '#030508',
    surface: 'rgba(16, 20, 26, 0.94)',
    surfaceRaised: '#141A22',
    border: 'rgba(185, 199, 214, 0.16)',
    borderStrong: 'rgba(185, 199, 214, 0.4)',
    text: '#EAEFF5',
    textMuted: '#A9B6C4',
    textFaint: '#78838F',
  },
  gradients: {
    hero: 'radial-gradient(120% 90% at 50% 0%, rgba(185,199,214,0.18) 0%, rgba(185,199,214,0) 55%), linear-gradient(170deg, #121A24 0%, #06080C 58%)',
    card: 'linear-gradient(155deg, rgba(185,199,214,0.11), rgba(94,127,168,0.07) 52%, rgba(0,0,0,0))',
    cta: 'linear-gradient(180deg, #D3DEE9 0%, #8FA3B8 100%)',
    aura: 'radial-gradient(closest-side, rgba(150,175,205,0.45), transparent)',
  },
  glow: {
    soft: '0 10px 36px -20px rgba(185,199,214,0.3), 0 2px 10px rgba(0,0,0,0.7)',
    strong: '0 0 34px -10px rgba(185,199,214,0.35), 0 24px 58px -26px rgba(0,0,0,0.95)',
    ring: '0 0 0 1px rgba(185,199,214,0.24)',
  },
  card: {
    border: '1px solid rgba(185, 199, 214, 0.18)',
    shadowHover:
      'inset 0 1px 0 rgba(185,199,214,0.26), 0 0 28px -12px rgba(185,199,214,0.35), 0 18px 44px -22px rgba(0,0,0,0.95)',
  },
  button: {
    background: 'linear-gradient(180deg, #D3DEE9 0%, #8FA3B8 100%)',
    backgroundHover: 'linear-gradient(180deg, #E4EDF5 0%, #A2B5C8 100%)',
    color: '#0D1219',
    border: '1px solid rgba(230, 238, 246, 0.35)',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 10px 24px -14px rgba(185,199,214,0.5)',
  },
  badge: {
    background: 'rgba(185, 199, 214, 0.11)',
    color: '#CFDAE5',
    border: '1px solid rgba(185, 199, 214, 0.3)',
  },
  decor: {
    particles: 'dust',
    intensity: 0.45,
    horizon: 'ruins',
  },
}
