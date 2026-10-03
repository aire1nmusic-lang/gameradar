import type { GameTheme } from './core/types'

/**
 * Light mode keeps the identity of a game world, but moves its surfaces into
 * warm paper/champagne instead of switching to generic white UI.
 */
export function lightWorldTheme(theme: GameTheme): GameTheme {
  return {
    ...theme,
    colors: {
      ...theme.colors,
      bg: '#F4EFE6',
      bgDeep: '#EAE2D5',
      surface: 'rgba(255,250,242,0.94)',
      surfaceRaised: '#FBF6ED',
      border: 'rgba(91,70,38,0.16)',
      borderStrong: 'rgba(175,128,43,0.45)',
      text: '#202127',
      textMuted: '#66656A',
      textFaint: '#89847C',
    },
    gradients: {
      ...theme.gradients,
      hero: 'linear-gradient(180deg, #EDE3D3 0%, #F4EFE6 100%)',
    },
    glow: {
      ...theme.glow,
      soft: '0 10px 30px -18px rgba(83,64,35,0.24)',
      strong: '0 18px 46px -24px rgba(83,64,35,0.32)',
      ring: '0 0 0 1px rgba(175,128,43,0.24)',
    },
    card: {
      ...theme.card,
      background: 'linear-gradient(180deg, rgba(255,251,245,.98), rgba(247,240,229,.98))',
      border: '1px solid rgba(91,70,38,.14)',
      shadow: '0 8px 24px -16px rgba(83,64,35,.24)',
      shadowHover: '0 12px 30px -16px rgba(83,64,35,.30)',
      overlay: 'linear-gradient(to top, rgba(244,239,230,.96) 14%, rgba(244,239,230,.45) 58%, rgba(244,239,230,.04))',
    },
  }
}
