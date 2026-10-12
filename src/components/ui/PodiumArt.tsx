import { artSrc, serverArt } from '@/data/themeMedia'
import type { GameServer } from '@/models'
import './l2-podium-scene.css'

/**
 * Lineage II world shelves display a fixed character for each PLACE, not an
 * arbitrary server-specific image: Baium -> first, Orc -> second, Dwarf -> third.
 * Only the displayed server, vote total and GS Coins change when rankings move.
 * Catalog/rating cards and other worlds still use their own per-server artwork.
 */
export function PodiumArt({ server, rank }: { server: GameServer; rank?: number }) {
  if (server.gameId === 'lineage2' && rank && rank >= 1 && rank <= 3) {
    return <span className={`gs-podium-person gs-podium-person--${rank}`} aria-hidden="true" />
  }
  const art = serverArt(server)
  if (!art) return null
  return (
    <span className="gs-podium-art" aria-hidden="true">
      <img src={artSrc(art, 800)} alt="" decoding="async" style={{ objectPosition: art.focus.desktop }} />
    </span>
  )
}
