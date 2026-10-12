import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import type { Game, GameServer } from '@/models'
import { chronicleOfVersion } from '@/data/games'
import { formatNumber } from '@/lib/format'
import { LaunchCountdown } from '@/components/server/LaunchCountdown'
import './leader-board.css'

export type BoardKind = 'support' | 'opening' | 'people'

/* Place art is bound to the place, not to the server: only names and numbers move. */
const PLACE = {
  1: { bg: '/media/ranks/l2-top1-bg-1600.webp', hero: '/media/ranks/l2-top3-hero-600.webp' },
  2: { bg: '/media/ranks/l2-top2-1600.webp' },
  3: { bg: '/media/ranks/l2-top3-band-1600.webp' },
} as Record<number, { bg: string; hero?: string }>
const ICON = { 1: 'i-crown', 2: 'i-axes', 3: 'i-anvil' } as Record<number, string>
const RULE = { 1: '#e8b964', 2: '#b8c9e0', 3: '#b77ee6' } as Record<number, string>
const day = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', timeZone: 'Europe/Moscow' })

function Defs() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
    <linearGradient id="gsb-tab-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e2b25c"/><stop offset=".6" stopColor="#8a5a1c"/><stop offset="1" stopColor="#3a2608"/></linearGradient>
    <symbol id="i-crown" viewBox="0 0 26 20"><path fill="currentColor" d="M2 15h22l-1.6-10.5-5.6 4.4L13 1.5 8.2 8.9 2.6 4.5z"/><rect x="2" y="16.2" width="22" height="2.6" rx="1.2" fill="currentColor"/></symbol>
    <symbol id="i-axes" viewBox="0 0 28 26"><g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 23 22 4M22 23 6 4"/></g><path fill="currentColor" d="M18 2c4 0 7 3 7 7l-4-1-2-3zM10 2C6 2 3 5 3 9l4-1 2-3z"/></symbol>
    <symbol id="i-anvil" viewBox="0 0 28 24"><path fill="currentColor" d="M2 6h16c4 0 7 1 8 4h-8c-1 3-3 4-6 4v3h4v3H6v-3h3v-3C5 14 3 10 2 6z"/></symbol>
    <linearGradient id="gsb-rule" x1="0" x2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0"/><stop offset=".5" stopColor="currentColor" stopOpacity=".8"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient>
    <symbol id="i-rule" viewBox="0 0 400 10" preserveAspectRatio="none"><rect x="0" y="4.5" width="400" height="1" fill="url(#gsb-rule)"/><path d="M186 5l14-4 14 4-14 4z" fill="none" stroke="currentColor" strokeOpacity=".8" strokeWidth="1.4"/><path d="M196 5l4-2 4 2-4 2z" fill="currentColor" fillOpacity=".8"/></symbol>
    <linearGradient id="gsb-hex" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7a6a55"/><stop offset=".5" stopColor="#3b352d"/><stop offset="1" stopColor="#6d5e4b"/></linearGradient>
    <symbol id="i-hex" viewBox="0 0 56 65"><path d="M28 1.2 54.6 16.5v32L28 63.8 1.4 48.5v-32z" fill="rgba(16,18,24,.85)" stroke="url(#gsb-hex)" strokeWidth="2"/></symbol>
    <linearGradient id="gsb-logo" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#f3c574"/><stop offset="1" stopColor="#b3752e"/></linearGradient>
    <symbol id="i-logo" viewBox="0 0 40 40"><path d="M31 6H14.5a8 8 0 0 0 0 16h11a3.2 3.2 0 0 1 0 6.4H8l-4 5.6h21.5a9 9 0 0 0 0-18h-11a2.2 2.2 0 0 1 0-4.4H27z" fill="url(#gsb-logo)"/></symbol>
  </defs></svg>
}

/** Inner glass panel: low on the sides, raised in the middle, smooth S-curves. */
function Shape() {
  return <svg className="gsb-shape" viewBox="0 0 440 1000" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="gsb-if" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(30,34,46)" stopOpacity=".66"/><stop offset=".2" stopColor="rgb(18,21,29)" stopOpacity=".64"/><stop offset="1" stopColor="rgb(12,14,20)" stopOpacity=".7"/></linearGradient>
      <linearGradient id="gsb-ie" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".34"/><stop offset=".06" stopColor="#fff" stopOpacity=".14"/><stop offset="1" stopColor="#fff" stopOpacity=".07"/></linearGradient>
    </defs>
    <path d="M0 40 Q0 20 16 20 L170 20 C182 20 182 1 196 1 L330 1 C344 1 344 20 356 20 L424 20 Q440 20 440 40 L440 986 Q440 1000 426 1000 L14 1000 Q0 1000 0 986 Z" fill="url(#gsb-if)" stroke="url(#gsb-ie)" strokeWidth="1.3" vectorEffect="non-scaling-stroke"/>
  </svg>
}

export function LeaderBoard({ game, kind, title, kicker, sub, rows, loading, error, reload, emptyTitle, emptyText, href, filtered, isFav, toggleFav, defs }: {
  game: Game; kind: BoardKind; title: string; kicker: string; sub: string; rows: GameServer[]; loading: boolean; error: unknown; reload: () => void
  emptyTitle: string; emptyText: string; href: string; filtered: boolean; isFav: (slug: string) => boolean; toggleFav: (slug: string) => void; defs?: boolean
}) {
  const unit = kind === 'support' ? 'GS Coins' : 'голосов'
  const value = (s: GameServer) => formatNumber(kind === 'support' ? s.support?.coins ?? 0 : s.votes)
  const chron = (s: GameServer) => chronicleOfVersion(game.id, s.version)?.label ?? s.version
  const rates = (s: GameServer) => s.rates ? `x${String(s.rates).replace(/^[x×]/i, '')}` : ''
  const fav = (s: GameServer) => <button type="button" className={`fav gsb-fav ${isFav(s.slug) ? 'selected' : ''}`} aria-pressed={isFav(s.slug)} aria-label={isFav(s.slug) ? `Убрать ${s.name} из избранного` : `${s.name} в избранное`} onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFav(s.slug) }}><Heart size={14} fill={isFav(s.slug) ? 'currentColor' : 'none'} /></button>

  const plaque = (s: GameServer, rank: number) => {
    const place = PLACE[rank]
    const tags = [chron(s), rates(s)].filter(Boolean)
    return <Link key={s.id} to={`/server/${s.slug}`} data-place={rank} className={`server gsb-plaque p${rank}`}>
      <span className="gsb-art" aria-hidden="true"><img src={place.bg} alt="" decoding="async" /></span>
      {place.hero && <img className="gsb-hero" src={place.hero} alt="" aria-hidden="true" decoding="async" />}
      <span className="gsb-band" aria-hidden="true" />
      <svg className="gsb-tab" viewBox="0 0 66 24" aria-hidden="true"><path className="t-fill" d="M0.5 0H65.5V7L33 23.5L0.5 7Z"/><path className="t-in" d="M7 0V7L33 20L59 7V0"/><path className="t-edge" d="M0.5 0V7L33 23.5L65.5 7V0"/></svg>
      <span className="gsb-medal"><img src={`/media/ranks/medal-${rank}-192.webp`} alt={`${rank} место`} /></span>
      <span className="gsb-copy">
        <span className="server-name gsb-name">{s.name}</span>
        <span className="server-meta gsb-meta"><svg><use href={`#${ICON[rank]}`} /></svg>{chron(s)}{rates(s) && <><i>•</i>{rates(s)}</>}</span>
        {tags.length > 0 && <span className="gsb-tags">{tags.map(t => <span key={t}>{t}</span>)}</span>}
      </span>
      <span className="server-right gsb-num">{kind === 'support' && <img src="/media/ranks/coins.svg" alt="" />}<span><small>{unit}</small><strong>{value(s)}</strong></span><svg className="gsb-rule" style={{ color: RULE[rank] }}><use href="#i-rule" /></svg></span>
      <span className="gsb-glass" aria-hidden="true" />
      {fav(s)}
    </Link>
  }
  const row = (s: GameServer, index: number) => <Link key={s.id} to={`/server/${s.slug}`} className={`server gsb-row ${index >= 10 ? 'gsb-overflow' : ''}`}>
    <span className="gsb-hex"><svg><use href="#i-hex" /></svg><span>{index + 1}</span></span><span className="gsb-div" />
    <span className="server-name gsb-row-name">{s.name}</span>
    <span className="server-meta gsb-row-meta">{chron(s)}{rates(s) && ` • ${rates(s)}`}</span>
    {kind === 'opening' && s.launch
      ? <span className="server-right gsb-row-num"><span><small><LaunchCountdown at={s.launch.at} /></small><strong>{day.format(new Date(s.launch.at))}</strong></span></span>
      : <span className="server-right gsb-row-num">{kind === 'support' && <img src="/media/ranks/coins.svg" alt="" />}<span><small>{unit}</small><strong>{value(s)}</strong></span></span>}
    {fav(s)}
  </Link>

  let body
  if (loading && !rows.length) body = <div className="gsb-empty" role="status"><b>Загружаем серверы…</b></div>
  else if (error && !rows.length) body = <div className="gsb-empty"><b>Не удалось загрузить данные</b><span>Проверь соединение и попробуй снова.</span><button type="button" className="quiet-btn" onClick={reload}>Повторить</button></div>
  else if (!rows.length) body = <div className="gsb-empty"><b>{filtered ? 'Ничего не найдено' : emptyTitle}</b><span>{filtered ? 'Попробуй другой запрос или сбрось фильтр.' : emptyText}</span></div>
  else if (kind === 'opening') body = rows.map((s, i) => row(s, i))
  else body = <>{rows.slice(0, 3).map((s, i) => plaque(s, i + 1))}{rows.slice(3).map((s, i) => row(s, i + 3))}</>

  return <section className={`panel gsb gs-shelf-${kind} ${kind === 'opening' ? 'openings' : kind === 'people' ? 'players' : 'support'}`} aria-labelledby={`l2-${kind}`}>
    {defs && <Defs />}
    <div className="gsb-strip">
      <span className="gsb-logo"><svg><use href="#i-logo" /></svg>GameScout<span className="sep" /><span className="world">{game.id === 'lineage2' ? 'LINEAGE II' : game.name.toUpperCase()}</span></span>
      <span className="gsb-label"><svg><use href="#i-crown" /></svg>{kicker}</span>
    </div>
    <div className="gsb-inner">
      <Shape />
      <header className="gsb-head"><h2 id={`l2-${kind}`}><Link to={href}>{title}</Link></h2><p>{sub}</p></header>
      <div className="gsb-list" aria-busy={loading}>{body}</div>
      <div className="gsb-more"><Link to={href} className="l2-all">{kind === 'opening' ? 'Календарь' : 'Все'} →</Link></div>
    </div>
  </section>
}
