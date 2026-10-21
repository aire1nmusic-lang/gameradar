import type { Chronicle, Game } from '@/models'

export const L2_MAIN_CHRONICLES = ['interlude', 'high-five', 'essence'] as const
const mainVersions = new Set(['Interlude', 'High Five', 'Essence'])

/** Complement by actual version, including records with no chronicle ID. */
export function isOtherL2Version(version: string): boolean {
  return !mainVersions.has(version)
}

export function otherL2Chronicle(game: Game): Chronicle {
  const others = game.chronicles.filter(c => !L2_MAIN_CHRONICLES.includes(c.id as typeof L2_MAIN_CHRONICLES[number]))
  return { id: 'other', slug: 'other', label: 'Другие хроники',
    tagline: 'Classic, ранние хроники и другие версии Lineage 2',
    versions: game.versions.filter(isOtherL2Version),
    serversCount: Math.max(0, game.serversCount - game.chronicles.filter(c => L2_MAIN_CHRONICLES.includes(c.id as typeof L2_MAIN_CHRONICLES[number])).reduce((sum, c) => sum + c.serversCount, 0)),
    playersOnline: others.reduce((sum, c) => sum + c.playersOnline, 0) }
}

export function l2ChronicleChoices(game: Game): Chronicle[] {
  return [...L2_MAIN_CHRONICLES.flatMap(id => game.chronicles.filter(c => c.id === id)), otherL2Chronicle(game)]
}
