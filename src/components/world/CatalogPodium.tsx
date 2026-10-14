import { Heart, ThumbsUp, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { GameServer } from '@/models'
import { OnlineStatus } from '@/models'
import { chronicleOfVersion } from '@/data/games'
import { formatNumber, formatPlayers } from '@/lib/format'
import { useFavorites } from '@/hooks/useFavorites'
import { PlacePlaque } from './LeaderBoard'
import './leader-board.css'

/** The catalog list's top three, drawn as the same place plaques as on the boards. Numbers are the list's own metric. */
export function CatalogPodium({ servers, metric }: { servers: GameServer[]; metric: 'auto' | 'support' | 'votes' }) {
  const { has, toggle } = useFavorites()
  const navigate = useNavigate()
  const meta = (s: GameServer) => [chronicleOfVersion(s.gameId, s.version)?.label ?? s.version, s.rates ? `x${String(s.rates).replace(/^[x×]/i, '')}` : ''].filter(Boolean).join(' · ')
  const value = (s: GameServer) => {
    if (metric === 'support') return <button type="button" className="server-right gsb-num gsb-coins-action" aria-label={`Поддержать ${s.name} за GS Coins`} onClick={event => {event.preventDefault();event.stopPropagation();navigate(`/server/${s.slug}?support=1`)}}><img className="gsb-coin" src="/media/ranks/coin-stack-96.webp" alt="" /><span><small>GS Coins</small><strong>{formatNumber(s.support?.coins ?? 0)}</strong></span></button>
    if (metric === 'votes') return <span className="server-right gsb-num"><ThumbsUp className="gsb-val-ic" aria-hidden /><span><small>голосов</small><strong>{formatNumber(s.votes)}</strong></span></span>
    const { status, freshness } = s.online
    const measured = s.online.playersKnown !== false && freshness === 'fresh' && status !== OnlineStatus.Unknown && status !== OnlineStatus.Pending && status !== OnlineStatus.Offline
    return <span className="server-right gsb-num"><Users className="gsb-val-ic" aria-hidden /><span><small>онлайн</small><strong>{measured ? formatPlayers(s.online) : '—'}</strong></span></span>
  }
  const fav = (s: GameServer) => <button type="button" className={`fav gsb-fav ${has(s.slug) ? 'selected' : ''}`} aria-pressed={has(s.slug)} aria-label={has(s.slug) ? `Убрать ${s.name} из избранного` : `${s.name} в избранное`} onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(s.slug) }}><Heart size={14} fill={has(s.slug) ? 'currentColor' : 'none'} /></button>
  return <div className="gs-rating-page gs-catalog-podium"><div className="gsb gsb-plain"><div className="gsb-list">
    {servers.slice(0, 3).map((s, i) => <PlacePlaque key={s.id} server={s} rank={i + 1} meta={meta(s)} value={value(s)} fav={fav(s)} art={metric === 'votes' ? 'people' : 'support'} />)}
  </div></div></div>
}
