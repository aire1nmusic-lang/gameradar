import type { CSSProperties, ReactNode } from 'react'
import { Coins, ThumbsUp } from 'lucide-react'
import './place-banner.css'

import { profilePlaceFor, type ProfilePlace } from '@/services/rankingPresentation'
export type { ProfilePlace } from '@/services/rankingPresentation'
export const placeOf = profilePlaceFor
export const PLACE_BOARD = { support: 'Поддержка серверов', people: 'Выбор игроков' }
const PLACE_TITLE: Record<number, string> = { 1: 'Первое место', 2: 'Второе место', 3: 'Третье место' }

/** The approved existing glass shields belong inside the identity header, in every world. */
export function PlaceBanner({ rank, children }: { rank: ProfilePlace | null; children: ReactNode }) {
  if (!rank) return children
  return <div className="gs-profile-distinction" data-place={rank.place} data-board={rank.board} data-rotating={rank.rotating || undefined}>
    <img className="gs-profile-place-shield" src={`/media/ranks/medal-${rank.place}-glass-192.webp`} width="192" height="192" alt={`ТОП-${rank.place}`} />
    <div className="gs-profile-distinction-body">
      <div className="gs-profile-place-copy"><span>{PLACE_BOARD[rank.board]}</span><strong>{PLACE_TITLE[rank.place]}</strong>{rank.rotating && <small className="gs-profile-rotation-note">Ротация · {rank.board === 'people' ? 'без голосов' : 'без поддержки'}</small>}</div>
      {children}
    </div>
  </div>
}

// A small, deterministic decoration layer. No timers, network, score changes or input interception.
export function ProfilePlaceParticles({ rank }: { rank: ProfilePlace | null }) {
  if (!rank) return null
  const Icon = rank.board === 'support' ? Coins : ThumbsUp
  return <div className="gs-profile-particles" aria-hidden="true">
    {[2, 97, 4, 94, 1, 98].map((left, i) => <span key={i} className="gs-profile-particle" style={{ '--particle-x': `${left}%`, '--particle-delay': `${i * -2.7}s`, '--particle-duration': `${16 + i * 1.7}s`, '--particle-drift': `${i % 2 ? -16 : 16}px` } as CSSProperties}><Icon size={i % 2 ? 19 : 24} strokeWidth={1.35} /></span>)}
  </div>
}
