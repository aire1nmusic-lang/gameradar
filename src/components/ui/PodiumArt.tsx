import { artSrc, serverArt } from '@/data/themeMedia'
import type { GameServer } from '@/models'

/** Artwork inside a 1–3 place plaque: sits on the right and fades out before the text. */
export function PodiumArt({ server }: { server: GameServer }) {
  const art = serverArt(server)
  if (!art) return null
  return (
    <span className="gs-podium-art" aria-hidden="true">
      <img src={artSrc(art, 800)} alt="" loading="lazy" decoding="async" style={{ objectPosition: art.focus.desktop }} />
    </span>
  )
}
