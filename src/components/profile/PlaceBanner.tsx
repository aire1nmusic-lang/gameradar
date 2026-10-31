import type { CSSProperties, ReactNode } from 'react'
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
      <div className="gs-profile-place-copy"><span>{PLACE_BOARD[rank.board]}</span><strong>{PLACE_TITLE[rank.place]}</strong></div>
      {children}
    </div>
  </div>
}

// A small, deterministic decoration layer. No timers, network, score changes or input interception.
// Place colours: 1 gold, 2 silver, 3 purple — coins for the support board, likes for players' choice.
const METAL: Record<number, [string, string, string]> = { 1: ['#fff1b8', '#f2c75c', '#8a5d0b'], 2: ['#ffffff', '#cfd9e4', '#5f6e80'], 3: ['#efe4ff', '#a67cff', '#4a2a9c'] }

function Token({ kind, place, id }: { kind: 'support' | 'people'; place: number; id: string }) {
  const [light, mid, dark] = METAL[place] ?? METAL[1]
  return <svg className={`gs-sp-token ${kind === 'support' ? 'gs-sp-coin' : 'gs-sp-like'}`} data-token={kind} viewBox="0 0 48 48" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-face`} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor={light} /><stop offset=".55" stopColor={mid} /><stop offset="1" stopColor={dark} /></radialGradient>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={light} /><stop offset=".5" stopColor={dark} /><stop offset="1" stopColor={mid} /></linearGradient>
    </defs>
    <circle cx="24" cy="24" r="22" fill={`url(#${id}-rim)`} />
    <circle cx="24" cy="24" r="18" fill={`url(#${id}-face)`} stroke={dark} strokeOpacity=".55" strokeWidth="1" />
    {kind === 'support'
      ? <g fill="none" stroke={dark} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity=".85"><path d="M24 13.5l3.1 6.4 7 1-5.1 4.9 1.2 7L24 29.5l-6.2 3.3 1.2-7-5.1-4.9 7-1z" fill={light} fillOpacity=".55" /></g>
      : <g transform="translate(12 12)" fill={light} fillOpacity=".6" stroke={dark} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></g>}
    <ellipse cx="18" cy="15" rx="7" ry="3.2" fill="#fff" opacity=".35" transform="rotate(-25 18 15)" />
  </svg>
}

export function ProfilePlaceParticles({ rank }: { rank: ProfilePlace | null }) {
  if (!rank) return null
  return <div className="gs-profile-particles" aria-hidden="true">
    {[2, 97, 4, 94, 1, 98].map((left, i) => <span key={i} className="gs-profile-particle" style={{ '--particle-x': `${left}%`, '--particle-delay': `${i * -2.7}s`, '--particle-duration': `${16 + i * 1.7}s`, '--particle-drift': `${i % 2 ? -16 : 16}px` } as CSSProperties}><Token kind={rank.board} place={rank.place} id={`gs-tok-${i}`} /></span>)}
  </div>
}
