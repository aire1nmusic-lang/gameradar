import { LaunchRow } from '@/components/server/LaunchRow'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Coins, Crown, Heart, Hourglass, ThumbsUp } from 'lucide-react'
import type { Game, GameServer } from '@/models'
import { chronicleOfVersion } from '@/data/games'
import { formatNumber } from '@/lib/format'
import { LaunchCountdown } from '@/components/server/LaunchCountdown'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { gamePlaceScene } from '@/data/podiumScenes'
import { useRankingRotation } from '@/hooks/useRankingRotation'
import type { RankingContext } from '@/services/rankingPresentation'
import './leader-board.css'

export type BoardKind = 'support' | 'opening' | 'people'

/* Place art is bound to the place, not to the server: only names and numbers move. */
const PLACE: Record<number, { bg: string; hero?: string }> = {
  1: { bg: '/media/ranks/l2-top1-bg-800.webp', hero: '/media/ranks/l2-top3-hero-600.webp' },
  2: { bg: '/media/ranks/l2-top2-800.webp' },
  3: { bg: '/media/ranks/l2-top3-800.webp' },
}
/* «Выбор игроков» has its own scenes for places 2 and 3, so the two boards differ at a glance. */
const PEOPLE_PLACE: Record<number, { bg: string; hero?: string }> = {
  1: { bg: '/media/ranks/l2-people1-800.webp', hero: '/media/ranks/l2-people1-hero-600.webp' },
  2: { bg: '/media/ranks/l2-people2-800.webp' },
  3: { bg: '/media/ranks/l2-people3-800.webp' },
}
export type PlaceArt = 'support' | 'people'

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
    let lastW = -1, lastH = -1
    const apply = (w: number, h: number) => {
      // Re-cut the outline only when the size really changed (images and fonts settle several times).
      w = Math.round(w); h = Math.round(h)
      if (w === lastW && h === lastH) return
      lastW = w; lastH = h
      const d = shapePath(w, h)
      const frost = el.querySelector<HTMLElement>('.gsb-frost')
      const edge = el.querySelector('.gsb-edge path')
      if (frost) frost.style.clipPath = `path('${d}')`
      edge?.setAttribute('d', d)
    }
    // No initial offsetWidth read: in a layout effect it forced the whole first page layout synchronously.
    // The observer reports the first size itself, after the browser's own layout and before paint.
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0]
      if (box) apply(box.inlineSize, box.blockSize)
      else apply(entry.contentRect.width, entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return ref
}

/** One top-3 plaque: place art, glass medal, film with the server. Shared by the boards and the catalog list. */
export function PlacePlaque({ server: s, rank, meta, value, fav, art = 'support', rankingContext }: { server: GameServer; rank: number; meta: string; value: ReactNode; fav: ReactNode; art?: PlaceArt; rankingContext?: RankingContext }) {
  const gameScene = gamePlaceScene(s.gameId, art, rank)
  const place = gameScene ?? (art === 'people' ? PEOPLE_PLACE : PLACE)[rank]
  const medal = s.gameId === 'minecraft' || s.gameId === 'gtarp'
    ? `/media/ranks/${s.gameId}-rank-${rank}-approved-v1.webp`
    : `/media/ranks/medal-${rank}-glass-192.webp`
  return <div className={`server gsb-plaque p${rank}`} data-rank={rank} data-game={s.gameId} data-podium-kind={art} data-character={gameScene?.character}>
    <Link to={`/server/${s.slug}${rankingContext ? `?ranking=${rankingContext.board}` : ''}`} state={rankingContext ? { rankingContext } : undefined} className="gsb-hitbox" aria-label={`Открыть сервер ${s.name}`} />
    <span className="gsb-art" aria-hidden="true"><img src={place.bg} alt="" decoding="async" /></span>
    {place.hero && <img className={`gsb-hero gsb-hero-${art}`} src={place.hero} alt="" aria-hidden="true" decoding="async" />}
    <span className="gsb-medal"><img src={medal} alt={`${rank} место`} /></span>
    <span className="gsb-bar">
      <ServerLogo name={s.name} hue={s.hue} gameId={s.gameId} src={s.logoUrl} size="sm" forceGameGlyph className="gsb-avatar" /><span className="gsb-txt"><span className="server-name gsb-name">{s.name}</span><span className="server-meta gsb-meta">{meta}</span></span>
      {value}{fav}
    </span>
    <span className="gsb-glass" aria-hidden="true" />
  </div>
}

export function LeaderBoard({ game, kind, title, rows: sourceRows, rotate, loading, error, reload, emptyTitle, emptyText, href, filtered, isFav, toggleFav, showAll = false }: {
  game: Game; kind: BoardKind; title: string; kicker?: string; sub?: string; rows: GameServer[]
  /** order the rows by this rotating board here, so the rotation re-renders only this board */
  rotate?: 'support' | 'people'; loading: boolean; error: unknown; reload: () => void
  emptyTitle: string; emptyText: string; href: string; filtered: boolean; isFav: (slug: string) => boolean; toggleFav: (slug: string) => void; showAll?: boolean
}) {
  const rotated = useRankingRotation(sourceRows, rotate ?? 'support', !!rotate)
  const rows = rotate ? rotated : sourceRows
  const inner = useFrost()
  const navigate = useNavigate()
  const openSupport = (server: GameServer) => navigate(`/server/${server.slug}?support=1`)
  const unit = kind === 'support' ? 'GS Coins' : 'голосов'
  const value = (s: GameServer) => formatNumber(kind === 'support' ? s.support?.coins ?? 0 : s.votes)
  const meta = (s: GameServer) => [chronicleOfVersion(game.id, s.version)?.label ?? s.version, s.rates ? `x${String(s.rates).replace(/^[x×]/i, '')}` : ''].filter(Boolean).join(' · ')
  const fav = (s: GameServer) => <button type="button" className={`fav gsb-fav ${isFav(s.slug) ? 'selected' : ''}`} aria-pressed={isFav(s.slug)} aria-label={isFav(s.slug) ? `Убрать ${s.name} из избранного` : `${s.name} в избранное`} onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFav(s.slug) }}><Heart size={14} fill={isFav(s.slug) ? 'currentColor' : 'none'} /></button>
  const num = (s: GameServer) => kind === 'support' ? <button type="button" className="server-right gsb-num gsb-coins-action" aria-label={`Поддержать ${s.name} за GS Coins`} onClick={event => { event.preventDefault(); event.stopPropagation(); openSupport(s) }}><img className="gsb-coin" src="/media/ranks/coin-stack-96.webp" alt="" /><span><small>{unit}</small><strong>{value(s)}</strong></span></button> : <span className="server-right gsb-num"><ThumbsUp className="gsb-val-ic" aria-hidden /><span><small>{unit}</small><strong>{value(s)}</strong></span></span>
  // Rows: icon + number only, the unit is in the board title and the screen-reader label.
  const rowNum = (s: GameServer) => kind === 'support' ? <button type="button" className="server-right gsb-num gsb-num-compact gsb-coins-action" aria-label={`Поддержать ${s.name} за GS Coins`} onClick={event => { event.preventDefault(); event.stopPropagation(); openSupport(s) }}><img className="gsb-coin" src="/media/ranks/coin-stack-96.webp" alt="" /><strong>{value(s)}</strong></button> : <span className="server-right gsb-num gsb-num-compact" aria-label={`${value(s)} ${unit}`}><ThumbsUp className="gsb-val-ic" aria-hidden /><strong>{value(s)}</strong></span>
  const avatar = (s: GameServer) => <ServerLogo name={s.name} hue={s.hue} gameId={s.gameId} src={s.logoUrl} size="sm" forceGameGlyph className="gsb-avatar" />

  const rankingContext: RankingContext | undefined = kind === 'opening' ? undefined : { gameId: game.id, board: kind, ids: rows.map(server => server.id) }
  const plaque = (s: GameServer, rank: number) => <PlacePlaque key={s.id} server={s} rank={rank} meta={meta(s)} value={num(s)} fav={fav(s)} art={kind === 'people' ? 'people' : 'support'} rankingContext={rankingContext} />
  const row = (s: GameServer, index: number) => <div key={s.id} className={`server gsb-row ${!showAll && index >= 10 ? 'gsb-overflow' : ''}`}>
    <Link to={`/server/${s.slug}${rankingContext ? `?ranking=${rankingContext.board}` : ''}`} state={rankingContext ? { rankingContext } : undefined} className="gsb-hitbox" aria-label={`Открыть сервер ${s.name}`} />
    <span className="gsb-position" aria-label={`Место ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
    {avatar(s)}<span className="gsb-txt"><span className="server-name gsb-row-name">{s.name}</span><span className="server-meta gsb-row-meta">{meta(s)}</span></span>
    {kind === 'opening' && s.launch
      ? <span className="server-right gsb-num"><span><small><LaunchCountdown at={s.launch.at} /></small><strong>{new Date(s.launch.at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'Europe/Moscow' })}</strong></span></span>
      : rowNum(s)}
    {fav(s)}
  </div>

  let body
  if (loading && !rows.length) body = <div className="gsb-empty" role="status"><b>Загружаем серверы…</b></div>
  else if (error && !rows.length) body = <div className="gsb-empty"><b>Не удалось загрузить данные</b><span>Проверь соединение и попробуй снова.</span><button type="button" className="quiet-btn" onClick={reload}>Повторить</button></div>
  else if (!rows.length && kind === 'opening' && !filtered) body = <div className="server gsb-plaque p0 gsb-empty-plaque">
    <span className="gsb-art" aria-hidden="true"><img src={gamePlaceScene(game.id, 'support', 1)?.bg ?? '/media/ranks/gold-v1.webp'} alt="" decoding="async" /></span>
    <span className="gsb-bar"><span className="gsb-txt"><span className="server-name gsb-name">{emptyTitle}</span><span className="server-meta gsb-meta">{emptyText}</span></span></span>
    <span className="gsb-glass" aria-hidden="true" />
  </div>
  else if (!rows.length) body = <div className="gsb-empty"><b>{filtered ? 'Ничего не найдено' : emptyTitle}</b><span>{filtered ? 'Попробуй другой запрос или сбрось фильтр.' : emptyText}</span></div>
  else if (kind === 'opening') body = rows.map(s => <LaunchRow key={s.id} server={s} showGame={false}/>)
  // Rows past the tenth are never shown on a board; building them only cost DOM and image decoding.
  else body = <>{rows.slice(0, 3).map((s, i) => plaque(s, i + 1))}{rows.slice(3, showAll ? undefined : 10).map((s, i) => row(s, i + 3))}</>

  return <section className={`panel gsb gs-shelf-${kind} ${kind === 'opening' ? 'openings' : kind === 'people' ? 'players' : 'support'}`} aria-labelledby={`l2-${kind}`} data-game={game.id}>
    <div className="gsb-strip"><span className="gsb-label">{kind === 'support' ? <Coins className="gsb-label-ic" aria-hidden /> : kind === 'opening' ? <Hourglass className="gsb-label-ic" aria-hidden /> : <Crown className="gsb-label-ic" aria-hidden />}{title}</span></div>
    <div className="gsb-inner" ref={inner}>
      <span className="gsb-frost" aria-hidden="true" />
      <svg className="gsb-edge" aria-hidden="true"><path /></svg>
      <header className="gsb-head"><h2 id={`l2-${kind}`} className="sr-only"><Link to={href}>{title}</Link></h2></header>
      <div className="gsb-list" aria-busy={loading}>{body}</div>
      <div className="gsb-more"><Link to={href} className="l2-all">{kind === 'opening' ? 'Календарь' : 'Все'} →</Link></div>
    </div>
  </section>
}
