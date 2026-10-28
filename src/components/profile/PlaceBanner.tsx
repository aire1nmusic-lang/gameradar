import type { CSSProperties, ReactNode } from 'react'
import { Coins, Sparkles, ThumbsUp } from 'lucide-react'
import type { GameServer } from '@/models'
import './place-banner.css'

export type ProfilePlace = { place: number; board: 'support' | 'people' | 'online' }
export const PLACE_BOARD = { support: 'Поддержка серверов', people: 'Выбор игроков', online: 'По онлайну' }
const PLACE_TITLE: Record<number, string> = { 1: 'Первое место', 2: 'Второе место', 3: 'Третье место' }

/** Place in the real rankings: support (GS Coins > 0), votes (> 0), then fresh measured online. Each banner names its actual ranking. */
export function placeOf(server: GameServer, peers: GameServer[]): ProfilePlace | null {
  peers = peers.filter(s=>s.gameId===server.gameId)
  const paid = peers.filter(s => (s.support?.coins ?? 0) > 0).sort((a, b) => (b.support?.coins ?? 0) - (a.support?.coins ?? 0) || b.votes - a.votes)
  const bySupport = paid.findIndex(s => s.id === server.id)
  if (bySupport >= 0 && bySupport < 3) return { place: bySupport + 1, board: 'support' }
  const voted = peers.filter(s => s.votes > 0).sort((a, b) => b.votes - a.votes)
  const byVotes = voted.findIndex(s => s.id === server.id)
  if (byVotes >= 0 && byVotes < 3) return { place: byVotes + 1, board: 'people' }
  const online = peers.filter(s=>s.online.playersKnown===true&&s.online.freshness==='fresh'&&!['UNKNOWN','OFFLINE','PENDING','ANOMALY'].includes(s.online.status)).sort((a,b)=>b.online.current-a.online.current||a.id.localeCompare(b.id))
  const byOnline=online.findIndex(s=>s.id===server.id)
  if(byOnline>=0&&byOnline<3)return {place:byOnline+1,board:'online'}
  return null
}

/** The approved existing glass shields belong inside the identity header, in every world. */
export function PlaceBanner({ rank, children }: { rank: ProfilePlace | null; children: ReactNode }) {
  if (!rank) return children
  return <div className="gs-profile-distinction" data-place={rank.place} data-board={rank.board}>
    <img className="gs-profile-place-shield" src={`/media/ranks/medal-${rank.place}-glass-192.webp`} width="192" height="192" alt={`ТОП-${rank.place}`} />
    <div className="gs-profile-distinction-body">
      <div className="gs-profile-place-copy"><span>{PLACE_BOARD[rank.board]}</span><strong>{PLACE_TITLE[rank.place]}</strong></div>
      {children}
    </div>
  </div>
}

// A small, deterministic decoration layer. No timers, network, score changes or input interception.
export function ProfilePlaceParticles({ rank }: { rank: ProfilePlace | null }) {
  if (!rank) return null
  const Icon = rank.board === 'support' ? Coins : rank.board === 'people' ? ThumbsUp : Sparkles
  return <div className="gs-profile-particles" aria-hidden="true">
    {[2, 97, 4, 94, 1, 98].map((left, i) => <span key={i} className="gs-profile-particle" style={{ '--particle-x': `${left}%`, '--particle-delay': `${i * -2.7}s`, '--particle-duration': `${16 + i * 1.7}s`, '--particle-drift': `${i % 2 ? -16 : 16}px` } as CSSProperties}><Icon size={i % 2 ? 19 : 24} strokeWidth={1.35} /></span>)}
  </div>
}
