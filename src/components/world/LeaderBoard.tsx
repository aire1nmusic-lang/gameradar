import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import type { Game, GameServer } from '@/models'
import { chronicleOfVersion } from '@/data/games'
import { formatNumber } from '@/lib/format'
import { LaunchCountdown } from '@/components/server/LaunchCountdown'
import { ServerLogo } from '@/components/ui/ServerLogo'
import './leader-board.css'

export type BoardKind = 'support' | 'opening' | 'people'

/* Place art is bound to the place, not to the server: only names and numbers move. */
const PLACE: Record<number, { bg: string; hero?: string }> = {
  1: { bg: '/media/ranks/l2-top1-bg-1600.webp', hero: '/media/ranks/l2-top3-hero-600.webp' },
  2: { bg: '/media/ranks/l2-top2-1600.webp' },
  3: { bg: '/media/ranks/l2-top3-1600.webp' },
}

/** Frosted inner panel: low on the sides, raised in the middle; the outline follows the real size. */
function shapePath(w: number, h: number) {
  const t = 20, l = w * 170 / 440, r = w * 356 / 440
  return `M0 ${t + 16} Q0 ${t} 16 ${t} L${l} ${t} C${l + 12} ${t} ${l + 12} 1 ${l + 26} 1 L${r - 26} 1 C${r - 12} 1 ${r - 12} ${t} ${r} ${t} L${w - 16} ${t} Q${w} ${t} ${w} ${t + 16} L${w} ${h - 14} Q${w} ${h} ${w - 14} ${h} L14 ${h} Q0 ${h} 0 ${h - 14} Z`
}
function useFrost() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = () => {
      const d = shapePath(el.offsetWidth, el.offsetHeight)
      const frost = el.querySelector<HTMLElement>('.gsb-frost')
      const edge = el.querySelector('.gsb-edge path')
      if (frost) frost.style.clipPath = `path('${d}')`
      edge?.setAttribute('d', d)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return ref
}

export function LeaderBoard({ game, kind, title, rows, loading, error, reload, emptyTitle, emptyText, href, filtered, isFav, toggleFav, showAll = false }: {
  game: Game; kind: BoardKind; title: string; kicker?: string; sub?: string; rows: GameServer[]; loading: boolean; error: unknown; reload: () => void
  emptyTitle: string; emptyText: string; href: string; filtered: boolean; isFav: (slug: string) => boolean; toggleFav: (slug: string) => void; showAll?: boolean
}) {
  const inner = useFrost()
  const unit = kind === 'support' ? 'GS Coins' : 'голосов'
  const value = (s: GameServer) => formatNumber(kind === 'support' ? s.support?.coins ?? 0 : s.votes)
  const meta = (s: GameServer) => [chronicleOfVersion(game.id, s.version)?.label ?? s.version, s.rates ? `x${String(s.rates).replace(/^[x×]/i, '')}` : ''].filter(Boolean).join(' · ')
  const fav = (s: GameServer) => <button type="button" className={`fav gsb-fav ${isFav(s.slug) ? 'selected' : ''}`} aria-pressed={isFav(s.slug)} aria-label={isFav(s.slug) ? `Убрать ${s.name} из избранного` : `${s.name} в избранное`} onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFav(s.slug) }}><Heart size={14} fill={isFav(s.slug) ? 'currentColor' : 'none'} /></button>
  const num = (s: GameServer) => <span className="server-right gsb-num">{kind === 'support' && <img src="/media/ranks/coins-gs-128.webp" alt="" />}<span><small>{unit}</small><strong>{value(s)}</strong></span></span>
  // Rows: icon + number only, the unit is in the board title and the screen-reader label.
  const rowNum = (s: GameServer) => <span className="server-right gsb-num gsb-num-compact" aria-label={`${value(s)} ${unit}`}>{kind === 'support' ? <img src="/media/ranks/coins-gs-128.webp" alt="" /> : <svg className="gsb-vote" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h4v11H3zM9 21h8.5a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 19 10h-5l.8-4.2A1.8 1.8 0 0 0 13 3.6L9 9z" /></svg>}<strong>{value(s)}</strong></span>
  const avatar = (s: GameServer) => <ServerLogo name={s.name} hue={s.hue} gameId={s.gameId} src={s.logoUrl} size="sm" forceGameGlyph className="gsb-avatar" />

  const plaque = (s: GameServer, rank: number) => <Link key={s.id} to={`/server/${s.slug}`} className={`server gsb-plaque p${rank}`}>
    <span className="gsb-art" aria-hidden="true"><img src={PLACE[rank].bg} alt="" decoding="async" /></span>
    {PLACE[rank].hero && <img className="gsb-hero" src={PLACE[rank].hero} alt="" aria-hidden="true" decoding="async" />}
    <span className="gsb-medal"><img src={`/media/ranks/medal-${rank}-192.webp`} alt={`${rank} место`} /></span>
    <span className="gsb-bar">
      {avatar(s)}<span className="gsb-txt"><span className="server-name gsb-name">{s.name}</span><span className="server-meta gsb-meta">{meta(s)}</span></span>
      {num(s)}{fav(s)}
    </span>
    <span className="gsb-glass" aria-hidden="true" />
  </Link>
  const row = (s: GameServer, index: number) => <Link key={s.id} to={`/server/${s.slug}`} className={`server gsb-row ${!showAll && index >= 10 ? 'gsb-overflow' : ''}`}>
    <span className="gsb-hex"><svg viewBox="0 0 56 65" aria-hidden="true"><path d="M28 1.2 54.6 16.5v32L28 63.8 1.4 48.5v-32z" /></svg><span>{index + 1}</span></span>
    {avatar(s)}<span className="gsb-txt"><span className="server-name gsb-row-name">{s.name}</span><span className="server-meta gsb-row-meta">{meta(s)}</span></span>
    {kind === 'opening' && s.launch
      ? <span className="server-right gsb-num"><span><small><LaunchCountdown at={s.launch.at} /></small><strong>{new Date(s.launch.at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'Europe/Moscow' })}</strong></span></span>
      : rowNum(s)}
    {fav(s)}
  </Link>

  let body
  if (loading && !rows.length) body = <div className="gsb-empty" role="status"><b>Загружаем серверы…</b></div>
  else if (error && !rows.length) body = <div className="gsb-empty"><b>Не удалось загрузить данные</b><span>Проверь соединение и попробуй снова.</span><button type="button" className="quiet-btn" onClick={reload}>Повторить</button></div>
  else if (!rows.length && kind === 'opening' && !filtered) body = <div className="server gsb-plaque p0 gsb-empty-plaque">
    <span className="gsb-art" aria-hidden="true"><img src="/media/ranks/gold-v1.webp" alt="" decoding="async" /></span>
    <span className="gsb-bar"><span className="gsb-txt"><span className="server-name gsb-name">{emptyTitle}</span><span className="server-meta gsb-meta">{emptyText}</span></span></span>
    <span className="gsb-glass" aria-hidden="true" />
  </div>
  else if (!rows.length) body = <div className="gsb-empty"><b>{filtered ? 'Ничего не найдено' : emptyTitle}</b><span>{filtered ? 'Попробуй другой запрос или сбрось фильтр.' : emptyText}</span></div>
  else if (kind === 'opening') body = rows.map((s, i) => row(s, i))
  else body = <>{rows.slice(0, 3).map((s, i) => plaque(s, i + 1))}{rows.slice(3).map((s, i) => row(s, i + 3))}</>

  return <section className={`panel gsb gs-shelf-${kind} ${kind === 'opening' ? 'openings' : kind === 'people' ? 'players' : 'support'}`} aria-labelledby={`l2-${kind}`} data-game={game.id}>
    <div className="gsb-strip"><span className="gsb-label"><img className="gsb-crown" src="/media/ranks/crown-royal-128.webp" alt="" aria-hidden="true" decoding="async" />{title}</span></div>
    <div className="gsb-inner" ref={inner}>
      <span className="gsb-frost" aria-hidden="true" />
      <svg className="gsb-edge" aria-hidden="true"><path /></svg>
      <header className="gsb-head"><h2 id={`l2-${kind}`} className="sr-only"><Link to={href}>{title}</Link></h2></header>
      <div className="gsb-list" aria-busy={loading}>{body}</div>
      <div className="gsb-more"><Link to={href} className="l2-all">{kind === 'opening' ? 'Календарь' : 'Все'} →</Link></div>
    </div>
  </section>
}
