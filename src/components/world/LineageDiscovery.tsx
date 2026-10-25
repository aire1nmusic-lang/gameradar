import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Search, X } from 'lucide-react'
import type { Chronicle, Game, GameServer } from '@/models'
import { useAppearance } from '@/theme/appearance'
import { useFavorites } from '@/hooks/useFavorites'
import { chronicleOfVersion } from '@/data/games'
import { artSrc, worldArt } from '@/data/themeMedia'
import { formatCompact, formatNumber } from '@/lib/format'
import { hasFreshOnline } from '@/services/discoveryRanking'
import { peopleOrder } from '@/services/supportProjection'
import { useSupportRotation } from '@/hooks/useSupportRotation'
import { WorldIcon } from '@/components/icons/WorldIcon'
import { LeaderBoard } from './LeaderBoard'
import { InlineChroniclePicker } from './InlineChroniclePicker'
import './lineage-discovery.css'
import './minecraft-discovery.css'

type Shelf = 'support' | 'opening' | 'people'
// Same world page for every game; only the words and the title face differ.
const COPY: Record<string, { edition: string; lead: string; kicker: string; epoch: string }> = {
  lineage2: { edition: 'Мир, в который хочется вернуться', lead: 'От первых шагов в Глудио до осады Адена. Найди сервер, который станет твоим миром.', kicker: 'Хроники', epoch: 'Выбери свою эпоху' },
  minecraft: { edition: 'Строй, сражайся, исследуй', lead: 'Выживание, мини-игры и анархия. Найди сервер под свой стиль игры.', kicker: 'Режимы', epoch: 'Во что играем сегодня' },
  gtarp: { edition: 'Город живёт ролью', lead: 'Ролевые города на FiveM, RageMP и alt:V. Выбери, кем ты станешь.', kicker: 'Платформы', epoch: 'Где начнётся твоя история' },
}

const SHELF_SUB: Record<Shelf, string> = {
  support: 'Серверы, которые игроки поддержали за GS Coins',
  people: 'Серверы с наибольшим числом голосов игроков',
  opening: 'Ближайшие старты серверов по дате',
}

/** Approved Aether candidate, backed by the existing public discovery read model. */
export function LineageDiscovery({ game, chronicle, servers, loading, error, reload, demo }: {
  game: Game; chronicle?: Chronicle; servers: GameServer[]; loading: boolean; error: unknown; reload: () => void; demo: boolean
}) {
  const { colorMode } = useAppearance()
  const { has, toggle } = useFavorites()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const art = worldArt('hero', game.id, chronicle?.id)
  const l2Sunset = game.id === 'lineage2' && !chronicle // main L2 world: full-width party key art, own portrait frame on phones
  const statsReady = !loading && !error
  const known = servers.filter(hasFreshOnline)
  const upcoming = servers.filter(s => s.launch && Date.parse(s.launch.at) > Date.now())
  const visible = useMemo(() => servers.filter(s => (!query.trim() ||
    `${s.name} ${s.version} ${s.rates ?? ''}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')))), [servers, query])
  const rotatingSupport = useSupportRotation(servers)
  const visibleIds = new Set(visible.map(s => s.id))
  const support = rotatingSupport.filter(s => visibleIds.has(s.id))
  const people = [...visible].sort(peopleOrder)
  const openings = visible.filter(s => s.launch && Date.parse(s.launch.at) > Date.now()).sort((a,b) => Date.parse(a.launch!.at) - Date.parse(b.launch!.at))
  const filtered = query.trim().length > 0
  const submit = (e: FormEvent) => { e.preventDefault(); document.getElementById('l2-catalog')?.scrollIntoView({ behavior: 'smooth' }) }
  const present = new Set(servers.map(s => s.chronicleId ?? chronicleOfVersion(s.gameId, s.version)?.id))
  const allChronicles = [{ id: 'all', slug: '', label: 'Все' }, ...(game.id === 'lineage2' ? game.chronicles : game.chronicles.filter(c => present.has(c.id)))]
  const copy = COPY[game.id] ?? COPY.lineage2
  const ratingHref = (key: Shelf) => key === 'opening' ? `/openings?game=${game.id}` : `/rating?game=${game.id}&all=${key === 'people' ? 'people' : 'support'}`
  return <div className={`l2a l2a--${game.id} ${l2Sunset ? 'l2a--sunset' : ''} ${colorMode === 'light' ? 'light' : ''}`} style={art ? { '--art': `url("${artSrc(art, 2560)}")`, '--art-mobile': `url("${l2Sunset ? '/media/worlds/lineage-2/tower-v1-mobile-720.webp' : artSrc(art, 800)}")` } as CSSProperties : undefined}>
    <div className="scene" aria-hidden="true"><div className="atmosphere"/></div>
    <div className="wrap l2-content">
      <section className="hero gs-hero" aria-labelledby="l2-world-title"><div className="hero-copy"><div className="breadcrumb"><Link to="/">Зал миров</Link><span/><Link to={`/${game.slug}`}>{game.name}</Link>{chronicle && <> / {chronicle.label}</>}</div><div className="edition">{copy.edition}</div><h1 id="l2-world-title">{game.id === 'lineage2' ? <>Lineage <em>II</em></> : game.name}</h1>{chronicle ? <p className="chronicle-description">{chronicle.label} · {chronicle.tagline}</p> : <p>{copy.lead}</p>}<div className="metrics" aria-busy={!statsReady}><Link className="metric" to={`/catalog?game=${game.id}`}><strong>{statsReady ? formatNumber(servers.length) : '—'}</strong><small>серверов</small></Link><Link className="metric" to={`/openings?game=${game.id}`}><strong>{statsReady ? formatNumber(upcoming.length) : '—'}</strong><small>открытий</small></Link>{<Link className="metric" to={`/rating?game=${game.id}`} style={statsReady && known.length > 0 ? undefined : { visibility: 'hidden' }} aria-hidden={!(statsReady && known.length > 0)}><strong><i className="dot"/>{formatCompact(known.reduce((sum,s) => sum+s.online.current,0))}</strong><small>онлайн</small></Link>}</div></div><div className="hero-note">В каждом мире — своя история.<small>Выбери, где начнётся твоя.</small></div></section>
      <section className={`discovery${['lineage2','minecraft'].includes(game.id) ? ' discovery--inline' : ''}`} aria-label={`Поиск серверов ${game.name}`}><div className="search-row l2-main-search"><form className="search-box" onSubmit={submit}><Search size={20} aria-hidden/><input type="search" name="q" value={query} onChange={e => setQuery(e.target.value)} aria-label="Поиск по названию или рейтам" placeholder="Название сервера или рейты…" autoComplete="off"/><button className="find-btn" type="submit">Найти</button></form><div className="filter-summary"><strong>{chronicle?.label ?? 'Все хроники Lineage 2'}</strong>Выбирай свой стиль игры</div></div>{['lineage2','minecraft'].includes(game.id) ? <InlineChroniclePicker game={game} chronicle={chronicle} /> : <details key={chronicle?.id ?? 'all'} className="chronicle-picker"><summary className="gs-epoch-summary"><span className="gs-epoch-text"><span className="section-kicker">{copy.kicker}</span><span className="gs-epoch-title">{copy.epoch}</span></span><span className="gs-epoch-current">{chronicle?.label ?? 'Все'}</span><WorldIcon name="chevronRight" size={18} className="gs-epoch-chevron"/></summary><div className="chronicle-row"><nav className="chronicles" aria-label="Выбрать хроники">{allChronicles.map(c => { const active = c.id === (chronicle?.id ?? 'all'); const thumbnail = worldArt(game.id === 'lineage2' || c.id === 'all' ? 'hero' : 'card', game.id, c.id !== 'all' ? c.id : undefined); return <Link key={c.id} aria-current={active ? 'page' : undefined} className={`chron ${thumbnail ? '' : 'text'} ${active ? 'active' : ''}`} to={`/${game.slug}${c.slug ? '/'+c.slug : ''}`}>{thumbnail && <img src={artSrc(thumbnail,400)} alt="" width={400} height={170} decoding="async"/>}<span>{c.label}</span></Link> })}</nav></div></details>}</section>
      <section id="l2-catalog" aria-label={`Серверы ${game.name}`}><div className="catalog-toolbar"><span role="status">{demo ? 'Демонстрационные данные' : filtered ? `Найдено: ${formatNumber(visible.length)}` : 'Независимый каталог · открытые источники'}</span>{filtered && <button type="button" className="quiet-btn" onClick={() => {setQuery('')}} aria-label="Сбросить фильтры"><X size={15}/>Сбросить</button>}</div>{servers.some(s => s.rankingAvailability && !s.rankingAvailability.pending && (!s.rankingAvailability.votes || !s.rankingAvailability.support)) && <p className="gs-ranking-availability" role="status">Рейтинг временно недоступен</p>}<div className="catalog-grid"><><LeaderBoard game={game} kind="support" rows={support} title="Лидеры поддержки" kicker="Топ серверов" sub={SHELF_SUB.support} loading={loading} error={error} reload={reload} emptyTitle="Рейтинг пока формируется" emptyText="Здесь появятся серверы, получившие поддержку за Coins." href={ratingHref('support')} filtered={filtered} isFav={has} toggleFav={toggle}/><LeaderBoard game={game} kind="opening" rows={openings} title="Скоро открытие" kicker="Новая глава" sub={SHELF_SUB.opening} loading={loading} error={error} reload={reload} emptyTitle="Ближайших открытий нет" emptyText="Как только проект объявит дату старта, он появится здесь." href={ratingHref('opening')} filtered={filtered} isFav={has} toggleFav={toggle}/><LeaderBoard game={game} kind="people" rows={people} title="Выбор игроков" kicker="Топ голосов" sub={SHELF_SUB.people} loading={loading} error={error} reload={reload} emptyTitle="Серверов пока нет" emptyText="Здесь появятся проекты и голоса игроков." href={ratingHref('people')} filtered={filtered} isFav={has} toggleFav={toggle}/></></div></section>
      <section className="owner glass"><div><h3>Твой сервер в GameScout</h3></div><button className="outline-btn" type="button" onClick={() => navigate(`/add-server?game=${game.id}`)}>Добавить сервер<ArrowRight size={20}/></button></section>
    </div>
  </div>
}


