import { artSrc, serverArt } from '@/data/themeMedia'
import type { GameServer } from '@/models'
import './l2-podium-scene.css'
import './game-podium.css'

/**
 * A place plaque is two layers bound to the PLACE, not to the server:
 * a softly blurred magic scene inside the plaque and, when drawn, a cut-out character over it.
 * `pop` lets the character rise above the plaque (first place only). Name, numbers and the
 * favourite are live text on top, so only they change when the ranking moves.
 */
type Scene = { bg: string; bgSmall: string; hero?: string; pop?: boolean; focus?: string }
const L2_SCENES: Record<number, Scene> = {
  1: { bg: '/media/ranks/l2-top1-bg-1600.webp', bgSmall: '/media/ranks/l2-top1-bg-800.webp', hero: '/media/ranks/l2-top3-hero', pop: true }, // DEMO hero until the first-place character arrives
  // Single finished images (character and scene drawn together); focus keeps the face in the plaque.
  2: { bg: '/media/ranks/l2-top2-1600.webp', bgSmall: '/media/ranks/l2-top2-800.webp', focus: '50% 30%' },
  3: { bg: '/media/ranks/l2-top3-band-1600.webp', bgSmall: '/media/ranks/l2-top3-band-800.webp', focus: '50% 50%' },
}

export function PodiumArt({ server, rank, kind = 'support' }: { server: GameServer; rank?: number; kind?: 'support' | 'people' }) {
  if (rank && rank <= 3 && (server.gameId === 'minecraft' || server.gameId === 'gtarp')) {
    const artwork = kind === 'people' || rank === 1
      ? `${server.gameId}-${kind}-${rank}-character-v2-800.webp`
      : `${server.gameId}-top-${rank}-character-v1-800.webp`
    return <span className="gs-game-plaque" data-podium-kind={kind} aria-hidden="true"><img src={`/media/ranks/${artwork}`} width={800} height={533} alt="" decoding="async" /></span>
  }
  const scene = server.gameId === 'lineage2' && rank ? L2_SCENES[rank] : undefined
  if (scene) {
    const hero = scene.hero && <img className="gs-plaque-hero" src={`${scene.hero}-600.webp`} srcSet={`${scene.hero}-300.webp 300w, ${scene.hero}-600.webp 600w`} sizes="220px" alt="" decoding="async" />
    return (
      <span className={`gs-plaque gs-plaque--${rank} ${scene.pop ? 'is-pop' : ''} ${scene.hero ? '' : 'is-single'}`} aria-hidden="true">
        <span className="gs-plaque-frame">
          <img className="gs-plaque-bg" src={scene.bg} srcSet={`${scene.bgSmall} 800w, ${scene.bg} 1600w`} sizes="(max-width:600px) 100vw, 640px" alt="" decoding="async" style={scene.focus ? { objectPosition: scene.focus } : undefined} />
          <span className="gs-plaque-sparks" />
          {!scene.pop && hero}
        </span>
        {scene.pop && hero}
      </span>
    )
  }
  const art = serverArt(server)
  if (!art) return null
  return (
    <span className="gs-podium-art" aria-hidden="true">
      <img src={artSrc(art, 800)} alt="" decoding="async" style={{ objectPosition: art.focus.desktop }} />
    </span>
  )
}
