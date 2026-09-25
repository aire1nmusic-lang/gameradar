import type { GameTheme } from '../core/types'

/**
 * Lineage 2 — dark fantasy.
 * Near-black stone, gold filigree, a serif display face and a quiet magic
 * glow. Frames are carved rather than rounded; nothing here is playful.
 */
export const lineage2Theme: GameTheme = {
  id: 'lineage2',
  label: 'Lineage 2',
  mood: 'Чёрный камень, золото и магический свет',
  colors: {
    primary: '#D8B25C',
    primarySoft: 'rgba(216, 178, 92, 0.14)',
    primaryStrong: '#B08D3C',
    secondary: '#5C7FC4',
    secondarySoft: 'rgba(92, 127, 196, 0.16)',
    accent: '#F3E6C6',
    bg: '#08070A',
    bgDeep: '#040306',
    surface: 'rgba(20, 17, 14, 0.94)',
    surfaceRaised: '#1A1611',
    border: 'rgba(216, 178, 92, 0.18)',
    borderStrong: 'rgba(216, 178, 92, 0.45)',
    text: '#F3EDE0',
    textMuted: '#C0B49B',
    textFaint: '#8A8172',
  },
  gradients: {
    hero: 'radial-gradient(120% 90% at 50% 0%, rgba(216,178,92,0.22) 0%, rgba(216,178,92,0) 55%), linear-gradient(170deg, #1A1208 0%, #08070A 58%)',
    card: 'linear-gradient(155deg, rgba(216,178,92,0.13), rgba(92,127,196,0.06) 52%, rgba(0,0,0,0))',
    cta: 'linear-gradient(180deg, #E8C87A 0%, #B08D3C 100%)',
    aura: 'radial-gradient(closest-side, rgba(216,178,92,0.5), transparent)',
  },
  glow: {
    soft: '0 10px 40px -18px rgba(216,178,92,0.35), 0 2px 10px rgba(0,0,0,0.7)',
    strong: '0 0 40px -8px rgba(216,178,92,0.45), 0 24px 60px -26px rgba(0,0,0,0.95)',
    ring: '0 0 0 1px rgba(216,178,92,0.28)',
  },
  card: {
    radius: '8px',
    background: 'linear-gradient(180deg, rgba(26,22,17,0.96), rgba(12,10,9,0.97))',
    border: '1px solid rgba(216, 178, 92, 0.2)',
    shadow: 'inset 0 1px 0 rgba(216,178,92,0.18), 0 2px 14px rgba(0,0,0,0.7)',
    shadowHover: 'inset 0 1px 0 rgba(216,178,92,0.3), 0 0 32px -10px rgba(216,178,92,0.4), 0 18px 44px -22px rgba(0,0,0,0.95)',
    overlay: 'linear-gradient(to top, rgba(8,7,10,0.97) 14%, rgba(8,7,10,0.6) 58%, rgba(8,7,10,0.1))',
    frame: 'carved',
  },
  button: {
    radius: '6px',
    background: 'linear-gradient(180deg, #E8C87A 0%, #B08D3C 100%)',
    backgroundHover: 'linear-gradient(180deg, #F3DB98 0%, #C49C45 100%)',
    color: '#1A1208',
    border: '1px solid rgba(243, 230, 198, 0.35)',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 10px 26px -12px rgba(216,178,92,0.55)',
    transform: 'uppercase',
    weight: '600',
    letterSpacing: '0.08em',
  },
  badge: {
    radius: '4px',
    background: 'rgba(216, 178, 92, 0.12)',
    color: '#E8D6A8',
    border: '1px solid rgba(216, 178, 92, 0.32)',
  },
  typography: {
    // One display face for the whole platform: the world's identity comes from
    // its key art, stone surfaces and pale-gold accents, not from a serif.
    display: "'Inter Tight', 'Inter', ui-sans-serif, system-ui, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    accentTransform: 'uppercase',
    accentSpacing: '0.16em',
    accentWeight: '500',
    displayScale: 1,
  },
  decor: {
    pattern: 'stone',
    particles: 'embers',
    intensity: 0.6,
    horizon: 'towers',
  },
}
