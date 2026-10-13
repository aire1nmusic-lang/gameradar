import type { GameServer } from '@/models'
import './place-banner.css'

const ART: Record<number, string> = { 1: '/media/ranks/l2-top1-bg-1600.webp', 2: '/media/ranks/l2-top2-1600.webp', 3: '/media/ranks/l2-top3-1600.webp' }

/** Place in the real rankings: support (GS Coins > 0) first, then players' votes (> 0). Zero scores never earn a place. */
export function placeOf(server: GameServer, peers: GameServer[]): { place: number; board: 'support' | 'people' } | null {
  const paid = peers.filter(s => (s.support?.coins ?? 0) > 0).sort((a, b) => (b.support?.coins ?? 0) - (a.support?.coins ?? 0) || b.votes - a.votes)
  const bySupport = paid.findIndex(s => s.id === server.id)
  if (bySupport >= 0 && bySupport < 3) return { place: bySupport + 1, board: 'support' }
  const voted = peers.filter(s => s.votes > 0).sort((a, b) => b.votes - a.votes)
  const byVotes = voted.findIndex(s => s.id === server.id)
  if (byVotes >= 0 && byVotes < 3) return { place: byVotes + 1, board: 'people' }
  return null
}

/** The server page wears the same plaque as the leaderboard while the server holds a top-3 place. */
export function PlaceBanner({ server, peers }: { server: GameServer; peers: GameServer[] }) {
  if (server.gameId !== 'lineage2') return null
  const found = placeOf(server, peers)
  if (!found) return null
  const { place, board } = found
  return <div className={`gs-place-banner pb${place}`} role="note">
    <img className="gs-place-art" src={ART[place]} alt="" aria-hidden="true" />
    <img className="gs-place-medal" src={`/media/ranks/medal-${place}-glass-192.webp`} alt={`${place} место`} />
    <span className="gs-place-text"><b>{place} место</b><span>{board === 'support' ? 'Лидеры поддержки' : 'Выбор игроков'} · Lineage 2</span></span>
  </div>
}
