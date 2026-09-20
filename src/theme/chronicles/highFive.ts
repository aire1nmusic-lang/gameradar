import type { ChronicleTheme } from '../core/types'

/**
 * High Five — gold and sieges.
 * The loudest chronicle: brighter gold, crimson secondary, stronger glow and
 * a slightly larger display scale. Still dark fantasy, never arcade.
 */
export const highFiveTheme: ChronicleTheme = {
  id: 'l2-high-five',
  parent: 'lineage2',
  label: 'High Five',
  mood: 'Золото, багрянец и осады замков',
  colors: {
    primary: '#EFCB7C',
    primarySoft: 'rgba(239, 203, 124, 0.16)',
    primaryStrong: '#C39A41',
    secondary: '#C23B4A',
    secondarySoft: 'rgba(194, 59, 74, 0.16)',
    accent: '#FFF3D6',
    bg: '#0A0707',
    bgDeep: '#050303',
    surface: 'rgba(25, 18, 15, 0.94)',
    surfaceRaised: '#211713',
    border: 'rgba(239, 203, 124, 0.2)',
    borderStrong: 'rgba(239, 203, 124, 0.5)',
    text: '#F8EFDC',
    textMuted: '#C9B99A',
    textFaint: '#94836C',
  },
  gradients: {
    hero: 'radial-gradient(120% 90% at 50% 0%, rgba(239,203,124,0.26) 0%, rgba(239,203,124,0) 52%), radial-gradient(80% 60% at 82% 18%, rgba(194,59,74,0.24) 0%, rgba(194,59,74,0) 60%), linear-gradient(170deg, #2A1A0C 0%, #0A0707 60%)',
    card: 'linear-gradient(155deg, rgba(239,203,124,0.16), rgba(194,59,74,0.08) 52%, rgba(0,0,0,0))',
    cta: 'linear-gradient(180deg, #F7DA96 0%, #C39A41 100%)',
    aura: 'radial-gradient(closest-side, rgba(239,203,124,0.55), transparent)',
  },
  glow: {
    soft: '0 10px 40px -16px rgba(239,203,124,0.45), 0 2px 10px rgba(0,0,0,0.7)',
    strong: '0 0 48px -8px rgba(239,203,124,0.55), 0 0 70px -24px rgba(194,59,74,0.45)',
    ring: '0 0 0 1px rgba(239,203,124,0.34)',
  },
  card: {
    border: '1px solid rgba(239, 203, 124, 0.24)',
    shadowHover:
      'inset 0 1px 0 rgba(239,203,124,0.34), 0 0 38px -10px rgba(239,203,124,0.5), 0 18px 46px -22px rgba(0,0,0,0.95)',
  },
  button: {
    background: 'linear-gradient(180deg, #F7DA96 0%, #C39A41 100%)',
    backgroundHover: 'linear-gradient(180deg, #FFE9B0 0%, #D8AC4C 100%)',
    color: '#241604',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 12px 30px -12px rgba(239,203,124,0.6)',
    letterSpacing: '0.1em',
  },
  badge: {
    background: 'rgba(239, 203, 124, 0.14)',
    color: '#F3DDA9',
    border: '1px solid rgba(239, 203, 124, 0.36)',
  },
  typography: {
    displayScale: 1.1,
    accentSpacing: '0.24em',
  },
  decor: {
    particles: 'embers',
    intensity: 0.7,
    horizon: 'towers',
  },
}
