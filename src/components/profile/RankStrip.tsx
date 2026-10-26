import { CalendarClock, Flame, Trophy } from 'lucide-react'
import './rank-strip.css'
import { cn } from '@/lib/utils'
import { formatCountdown } from '@/lib/format'
import { getGame } from '@/data/games'
import type { GameServer } from '@/models'
import { RankMedal } from '@/components/world/Shelves'

const measured = (server: GameServer) => server.online.playersKnown === true && server.online.freshness === 'fresh' && server.online.status !== 'UNKNOWN'

/**
 * Where this server stands, in one glance: place by online among the servers of the same
 * game, place by players' votes, and the countdown to the opening. Only what is measured.
 */
export function RankStrip({ server, peers, loading = false }: { server: GameServer; peers: GameServer[]; loading?: boolean }) {
  const game = getGame(server.gameId)
  const ranked = peers.filter(measured).sort((a, b) => b.online.current - a.online.current)
  const onlineRank = measured(server) ? ranked.findIndex((item) => item.id === server.id) + 1 : 0
  const byVotes = peers.filter((item) => item.votes > 0).sort((a, b) => b.votes - a.votes)
  const voteRank = server.votes > 0 ? byVotes.findIndex((item) => item.id === server.id) + 1 : 0
  const opening = server.launch && Date.parse(server.launch.at) > Date.now() ? server.launch.at : undefined
  // While the peers load, a measured server keeps one chip row reserved, so the card does not jump.
  if (loading && !peers.length && (measured(server) || server.votes > 0 || opening)) return <div className="mt-5 h-8" aria-hidden="true" />
  if (!onlineRank && !voteRank && !opening) return null

  const chip = 'gs-profile-rank-chip inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] py-1 pr-3.5 pl-1.5 text-[13px] text-ink-100'
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {onlineRank > 0 && (
        <span className={cn(chip, onlineRank <= 3 && 'border-[color:var(--gt-primary)]/50 bg-[color:var(--gt-primary)]/10')}>
          <RankMedal gameId={server.gameId} rank={onlineRank} className="h-6 w-6 text-[12px]" />
          <Flame size={13} className="opacity-70" /> №{onlineRank} по онлайну · {game.shortName} · среди {ranked.length} серверов с данными
        </span>
      )}
      {voteRank > 0 && (
        <span className={cn(chip, voteRank <= 3 && 'border-[color:var(--gt-primary)]/50 bg-[color:var(--gt-primary)]/10')}>
          <RankMedal gameId={server.gameId} rank={voteRank} className="h-6 w-6 text-[12px]" />
          <Trophy size={13} className="opacity-70" /> в народном рейтинге
        </span>
      )}
      {opening && (
        <span className={chip}>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-promo-500/20 text-promo-200"><CalendarClock size={13} /></span>
          открытие {formatCountdown(opening)}
        </span>
      )}
    </div>
  )
}
