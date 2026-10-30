import { CalendarClock, Coins, ThumbsUp } from 'lucide-react'
import './rank-strip.css'
import { formatCountdown } from '@/lib/format'
import type { GameServer } from '@/models'
import { RankMedal } from '@/components/world/Shelves'
import { presentationOrder, rankingPeriod } from '@/services/rankingPresentation'

/** Same two public boards/window as the lists; online is a measurement, never an award. */
export function RankStrip({ server, peers, loading = false, period = rankingPeriod() }: { server: GameServer; peers: GameServer[]; loading?: boolean; period?: number }) {
  const group = peers.filter(peer => peer.gameId === server.gameId)
  const opening = server.launch && Date.parse(server.launch.at) > Date.now() ? server.launch.at : undefined
  if (loading && !group.length) return <div className="mt-5 h-8" aria-hidden="true" />
  const ranks = (['support', 'people'] as const).map(board => ({ board, rank: presentationOrder(group, board, period).findIndex(peer => peer.id === server.id) + 1 }))
  if (!ranks.some(item => item.rank > 0) && !opening) return null
  const chip = 'gs-profile-rank-chip inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] py-1 pr-3.5 pl-1.5 text-[13px] text-ink-100'
  return <div className="mt-5 flex flex-wrap gap-2">
    {ranks.filter(item => item.rank > 0).map(({ board, rank }) => {
      const peer = group.find(peer => peer.id === server.id)!
      const rotating = (board === 'support' ? peer.support?.coins ?? 0 : peer.votes) <= 0
      const Icon = board === 'support' ? Coins : ThumbsUp
      return <span key={board} className={chip} data-ranking={board} data-rotating={rotating || undefined}>
        <RankMedal gameId={server.gameId} rank={rank} className="h-6 w-6 text-[12px]" />
        <Icon size={13} className="opacity-70" /> №{rank} · {board === 'support' ? 'Поддержка' : 'Выбор игроков'}
      </span>
    })}
    {opening && <span className={chip}><span className="grid h-6 w-6 place-items-center rounded-full bg-promo-500/20 text-promo-200"><CalendarClock size={13} /></span>открытие {formatCountdown(opening)}</span>}
  </div>
}
