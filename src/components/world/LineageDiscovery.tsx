import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Heart, Search, ShieldCheck, X } from 'lucide-react'
import type { Chronicle, Game, GameServer } from '@/models'
import { useAppearance } from '@/theme/appearance'
import { useFavorites } from '@/hooks/useFavorites'
import { chronicleOfVersion } from '@/data/games'
import { artSrc, worldArt } from '@/data/themeMedia'
import { formatCompact, formatNumber } from '@/lib/format'
import { hasFreshOnline } from '@/services/discoveryRanking'
import { peopleOrder, supportOrder } from '@/services/supportProjection'
import { ServerLogo } from '@/components/ui/ServerLogo'
import './lineage-discovery.css'

type Shelf = 'support' | 'opening' | 'people'
const dateDay = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', timeZone: 'Europe/Moscow' })
const dateMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'Europe/Moscow' })
const dateTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
const dateFull = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow' })

/** Approved Aether candidate, backed by the existing public discovery read model. */
export function LineageDiscovery({ game, chronicle, servers, loading, error, reload, demo }: {
  game: Game; chronicle?: Chronicle; servers: GameServer[]; loading: boolean; error: unknown; reload: () => void; demo: boolean
}) {
  const { colorMode } = useAppearance()
  const { has, toggle } = useFavorites()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [onlySaved, setOnlySaved] = useState(false)
  const [expanded, setExpanded] = useState<Set<Shelf>>(() => new Set())
  const art = worldArt('hero', game.id, chronicle?.id)
  const statsReady = !loading && !error
  const known = servers.filter(hasFreshOnline)
  const upcoming = servers.filter(s => s.launch && Date.parse(s.launch.at) > Date.now())
  const visible = useMemo(() => servers.filter(s => (!onlySaved || has(s.slug)) && (!query.trim() ||
    `${s.name} ${s.version} ${s.rates ?? ''}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')))), [servers, query, onlySaved, has])
  const support = [...visible].filter(s => (s.support?.coins ?? 0) > 0).sort(supportOrder)
  const people = [...visible].sort(peopleOrder)
  const openings = visible.filter(s => s.launch && Date.parse(s.launch.at) > Date.now()).sort((a,b) => Date.parse(a.launch!.at) - Date.parse(b.launch!.at))
  const filtered = query.trim().length > 0 || onlySaved
  const submit = (e: FormEvent) => { e.preventDefault(); document.getElementById('l2-catalog')?.scrollIntoView({ behavior: 'smooth' }) }
  const shelfToggle = (key: Shelf) => setExpanded(previous => { const next = new Set(previous); next.has(key) ? next.delete(key) : next.add(key); return next })
  const allChronicles = [{ id: 'all', slug: '', label: 'Все' }, ...game.chronicles]
  const ratingHref = (key: Shelf) => key === 'opening' ? `/openings?game=${game.id}` : `/rating?game=${game.id}&all=${key === 'people' ? 'people' : 'support'}`
  const shelf = (key: Shelf, rows: GameServer[], title: string, kicker: string, hint: string, emptyTitle: string, emptyText: string) => {
    const full = expanded.has(key)
    return <section className={`panel glass gs-shelf-${key} ${key === 'opening' ? 'openings' : key === 'people' ? 'players' : 'support'}`} aria-labelledby={`l2-${key}`}>
      <header className="panel-head"><div className="section-kicker">{kicker}</div><h2 id={`l2-${key}`}><Link to={ratingHref(key)}>{title}</Link></h2><p>{hint}</p></header>
      <div className="rows" aria-busy={loading}>
        {loading && !servers.length ? <div className="empty" role="status">Загружаем серверы…</div> : error && !servers.length ? <div className="empty"><strong>Не удалось загрузить данные</strong><p>Проверь соединение и попробуй снова.</p><button type="button" className="quiet-btn" onClick={reload}>Повторить</button></div> : rows.length ? rows.map((server, index) => <Link key={server.id} to={`/server/${server.slug}`} className={`server ${!full && index >= 15 ? 'l2-overflow-all' : ''} ${!full && index >= 5 ? 'gs-preview-overflow' : ''}`}>
          <ServerLogo name={server.name} hue={server.hue} src={server.logoUrl} gameId={game.id} size="sm" forceGameGlyph className="avatar" />
          <div className="server-copy"><span className="server-name">{server.name}</span><div className="server-meta">{chronicleOfVersion(game.id, server.version)?.label ?? server.version}{server.rates && ` · ×${String(server.rates).replace(/^[x×]/i, '')}`}{key === 'opening' && server.launch && <span> · {dateTime.format(new Date(server.launch.at))} МСК</span>}</div></div>
          <div className="server-right">{key === 'opening' && server.launch ? <time className="date" dateTime={server.launch.at} title={`${dateFull.format(new Date(server.launch.at))} МСК`}>{dateDay.format(new Date(server.launch.at))}<small>{dateMonth.format(new Date(server.launch.at))}</small></time> : <><strong>{formatNumber(key === 'support' ? server.support?.coins ?? 0 : server.votes)}</strong><small>{key === 'support' ? 'GS Coins' : 'голосов'}</small></>}</div>
          <button type="button" className={`fav ${has(server.slug) ? 'selected' : ''}`} aria-pressed={has(server.slug)} aria-label={has(server.slug) ? `Убрать ${server.name} из избранного` : `${server.name} в избранное`} onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(server.slug) }}><Heart size={15} fill={has(server.slug) ? 'currentColor' : 'none'} /></button>
        </Link>) : <div className="empty"><strong>{filtered ? 'Ничего не найдено' : emptyTitle}</strong><p>{filtered ? 'Попробуй другой запрос или сбрось фильтр.' : emptyText}</p></div>}
      </div>
      <footer className="panel-footer"><span>{key === 'support' ? 'Отдельно от голосов' : key === 'people' ? 'Органический рейтинг' : 'Время старта · МСК'}</span><div className="shelf-actions">{rows.length > 5 && <button type="button" className="l2-expand" aria-expanded={full} onClick={() => shelfToggle(key)}>{full ? 'Свернуть' : 'Показать ещё'}</button>}<Link to={ratingHref(key)} className="l2-all">{key === 'opening' ? 'Календарь' : 'Все'}<ArrowRight size={16}/></Link></div></footer>
      {key === 'people' && <div className="trust-note"><ShieldCheck size={13}/>Источник онлайна — сигнал доверия</div>}
      {key === 'support' && <div className="trust-note support-note">Поддержка не повышает органический рейтинг</div>}
    </section>
  }
  return <div className={`l2a ${colorMode === 'light' ? 'light' : ''}`} style={art ? { '--art': `url("${artSrc(art, 2560)}")`, '--art-mobile': `url("${artSrc(art, 800)}")` } as CSSProperties : undefined}>
    <div className="scene" aria-hidden="true"><div className="atmosphere"/></div>
    <div className="wrap l2-content">
      <section className="hero gs-hero" aria-labelledby="l2-world-title"><div className="hero-copy"><div className="breadcrumb"><Link to="/">Зал миров</Link><span/><Link to={`/${game.slug}`}>Lineage 2</Link>{chronicle && <> / {chronicle.label}</>}</div><div className="edition">Мир, в который хочется вернуться</div><h1 id="l2-world-title">Lineage <em>II</em></h1>{chronicle ? <p className="chronicle-description">{chronicle.label} · {chronicle.tagline}</p> : <p>От первых шагов в Глудио до осады Адена.<br/>Найди сервер, который станет твоим миром.</p>}<div className="metrics"><div className="metric"><strong>{statsReady && known.length ? <><i className="dot"/>{formatCompact(known.reduce((sum,s) => sum+s.online.current,0))}</> : '—'}</strong><small>игроков по источникам</small></div><div className="metric"><strong>{statsReady ? formatNumber(servers.length) : '—'}</strong><small>серверов</small></div><div className="metric"><strong>{statsReady ? formatNumber(upcoming.length) : '—'}</strong><small>открытий</small></div></div></div><div className="hero-note">В каждом мире — своя история.<small>Выбери, где начнётся твоя.</small></div></section>
      <section className="discovery glass" aria-label="Поиск серверов Lineage 2"><div className="search-row"><form className="search-box" onSubmit={submit}><Search size={20} aria-hidden/><input type="search" name="q" value={query} onChange={e => setQuery(e.target.value)} aria-label="Поиск по названию или рейтам" placeholder="Название сервера или рейты…" autoComplete="off"/><button className="find-btn" type="submit">Найти</button></form><div className="filter-summary"><strong>{chronicle?.label ?? 'Все хроники Lineage 2'}</strong>Выбирай свой стиль игры</div></div><div className="chronicle-row"><span className="chron-label">Хроники</span><nav className="chronicles" aria-label="Выбрать хроники">{allChronicles.map(c => { const active = c.id === (chronicle?.id ?? 'all'); const thumbnail = ['interlude','high-five','essence'].includes(c.slug) ? worldArt('card',game.id,c.id) : undefined; return <Link key={c.id} aria-current={active ? 'page' : undefined} className={`chron ${thumbnail ? '' : 'text'} ${active ? 'active' : ''}`} to={`/${game.slug}${c.slug ? '/'+c.slug : ''}`}>{thumbnail && <img src={artSrc(thumbnail,192)} alt="" width={27} height={27}/>}<span>{c.label}</span></Link> })}</nav></div></section>
      <section id="l2-catalog" aria-label="Серверы Lineage 2"><div className="catalog-toolbar"><span role="status">{demo ? 'Демонстрационные данные' : filtered ? `Найдено: ${formatNumber(visible.length)}` : 'Независимый каталог · открытые источники'}</span><button type="button" className="quiet-btn" aria-pressed={onlySaved} onClick={() => setOnlySaved(value => !value)}><Heart size={15}/>Избранное</button>{filtered && <button type="button" className="quiet-btn" onClick={() => {setQuery('');setOnlySaved(false)}} aria-label="Сбросить фильтры"><X size={15}/>Сбросить</button>}</div><div className="catalog-grid">{shelf('support',support,'Лидеры поддержки','Поддержка платформы','Помогают GameScout развиваться','Рейтинг пока формируется','Здесь появятся серверы, получившие поддержку за Coins.')}{shelf('opening',openings,'Скоро открытие','Новая глава','Начни путь на равных с остальными','Ближайших открытий нет','Как только проект объявит дату старта, он появится здесь.')}{shelf('people',people,'Выбор игроков','Голос сообщества','Рейтинг формируется голосами','Серверов пока нет','Здесь появятся проекты и голоса игроков.')}</div></section>
      <section className="owner glass"><div className="owner-mark" aria-hidden>II</div><div><h3>Твой сервер. Его новая история.</h3><p>Добавь свой мир в каталог и помоги игрокам найти тебя.</p></div><button className="outline-btn" type="button" onClick={() => navigate(`/add-server?game=${game.id}`)}>Добавить сервер<ArrowRight size={20}/></button></section>
    </div>
  </div>
}
