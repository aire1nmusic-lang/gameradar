/** Decorative place artwork never depends on a server or its current score. */
export type GamePlaceScene = { bg: string; hero?: string; character?: string }
const root = '/media/ranks/'
const scenes: Record<string, Record<'support' | 'people', Record<number, GamePlaceScene>>> = {
  lineage2: {
    support: {
      1: { bg: root+'l2-top1-bg-1600.webp', hero: root+'l2-top3-hero-600.webp' },
      2: { bg: root+'l2-top2-1600.webp' },
      3: { bg: root+'l2-top3-1600.webp' },
    },
    people: {
      1: { bg: root+'l2-people1-1600.webp', hero: root+'l2-people1-hero-600.webp' },
      2: { bg: root+'l2-people2-1600.webp' },
      3: { bg: root+'l2-people3-1600.webp' },
    },
  },
  minecraft: {
    support: {
      1: { bg: root+'minecraft-support-1-bg-v3.webp', hero: root+'minecraft-support-1-hero-v3.webp', character: 'Steve' },
      2: { bg: root+'minecraft-top-2-character-v1-800.webp' },
      3: { bg: root+'minecraft-top-3-character-v1-800.webp' },
    },
    people: {
      1: { bg: root+'minecraft-people-1-bg-v3.webp', hero: root+'minecraft-people-1-hero-v3.webp', character: 'Alex' },
      2: { bg: root+'minecraft-people-2-character-v2-800.webp' },
      3: { bg: root+'minecraft-people-3-character-v2-800.webp' },
    },
  },
  gtarp: {
    support: {
      1: { bg: root+'gtarp-support-1-bg-v3.webp', hero: root+'gtarp-support-1-hero-v3.webp', character: 'Michael De Santa' },
      2: { bg: root+'gtarp-support-2-v3.webp', character: 'Franklin Clinton' },
      3: { bg: root+'gtarp-support-3-v3.webp', character: 'Trevor Philips' },
    },
    people: {
      1: { bg: root+'gtarp-people-1-bg-v3.webp', hero: root+'gtarp-people-1-hero-v3.webp', character: 'Carl Johnson' },
      2: { bg: root+'gtarp-people-2-v3.webp', character: 'Tommy Vercetti' },
      3: { bg: root+'gtarp-people-3-v3.webp', character: 'Niko Bellic' },
    },
  },
}
export const gamePlaceScene = (gameId: string, kind: 'support' | 'people', rank: number) => scenes[gameId]?.[kind]?.[rank]
