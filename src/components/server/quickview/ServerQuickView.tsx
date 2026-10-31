import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, Copy, ExternalLink, Globe, Heart, MessageSquare, Send, Share2, X } from 'lucide-react'
import type { GameServer } from '@/models'
import { OnlineStatus } from '@/models'
import { useServer, useSimilarServers } from '@/hooks/data'
import { useFavorites } from '@/hooks/useFavorites'
import { chronicleOfVersion, getGame } from '@/data/games'
import { artSrc, serverArt, worldArt } from '@/data/themeMedia'
import { formatAge, formatDate, formatLaunch, formatNumber, formatPlayers, formatSeconds, formatSlots } from '@/lib/format'
import { hasFreshOnline } from '@/services/discoveryRanking'
import { track } from '@/services/events'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { VotePanel } from '@/components/profile/VotePanel'
import { LaunchCountdown } from '@/components/server/LaunchCountdown'
import { gamePlaceScene } from '@/data/podiumScenes'
import './quickview.css'

/** Pages where a server link keeps opening the full page: the server page itself and owner tools. */
const FULL_PAGE_ONLY = /^\/(server|dashboard|boost|account|admin|add-server|owners)(\/|$)/

/**
 * Server quick view: a click on any server link in lists opens the server beside the list
 * (a side panel on desktop, a bottom sheet on phones) instead of leaving the page.
 * The link stays a real link: new tab, middle click and the address `?server=slug` still work,
 * and the browser Back button closes the panel.
 */
export function ServerQuickViewHost() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const slug = params.get('server')
  const place = Number(params.get('place')) || 0
  const board = params.get('board') === 'people' ? 'people' : params.get('board') === 'support' ? 'support' : null

  const open = useCallback((next: string, top?: { place: number; board: 'support' | 'people' | null }) => {
    const search = new URLSearchParams(location.search)
    search.set('server', next)
    search.delete('place'); search.delete('board')
    if (top && top.place >= 1 && top.place <= 3) { search.set('place', String(top.place)); if (top.board) search.set('board', top.board) }
    navigate({ pathname: location.pathname, search: `?${search}`, hash: location.hash }, { state: { ...(location.state as object | null), quickview: true }, preventScrollReset: true })
  }, [location, navigate])

  const close = useCallback(() => {
    if ((location.state as { quickview?: boolean } | null)?.quickview && window.history.length > 1) { navigate(-1); return }
    const search = new URLSearchParams(location.search)
    search.delete('server'); search.delete('place'); search.delete('board')
    navigate({ pathname: location.pathname, search: search.size ? `?${search}` : '', hash: location.hash }, { replace: true, preventScrollReset: true })
  }, [location, navigate])

  // One delegated listener instead of touching every list: plain left clicks on /server/<slug> links.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const anchor = target?.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || anchor.target === '_blank' || anchor.dataset.fullPage !== undefined) return
      // Buttons inside a row (favourite, copy IP, support) keep their own action.
      const button = target?.closest('button')
      if (button && anchor.contains(button)) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      const match = /^\/server\/([^/?#]+)\/?$/.exec(url.pathname)
      if (!match || FULL_PAGE_ONLY.test(window.location.pathname)) return
      event.preventDefault()
      // A top-3 plaque or medal row carries its place: the panel then wears that place's art.
      const placed = target?.closest<HTMLElement>('[data-rank]')
      const rank = Number(placed?.dataset.rank) || 0
      const ranking = url.searchParams.get('ranking')
      const kind = ranking === 'people' || ranking === 'support' ? ranking : null
      open(decodeURIComponent(match[1]), rank >= 1 && rank <= 3 && !anchor.closest('.gs-qv') ? { place: rank, board: kind ?? (placed?.dataset.podiumKind === 'people' ? 'people' : kind) } : undefined)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [open])

  if (!slug || /^\/server\//.test(location.pathname)) return null
  return <QuickViewPanel key={`${slug}-${place}`} slug={slug} place={place >= 1 && place <= 3 ? place : 0} board={board} onClose={close} />
}

function useLockScroll() {
  useEffect(() => {
    const { overflow, paddingRight } = document.body.style
    const gap = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px`
    return () => { document.body.style.overflow = overflow; document.body.style.paddingRight = paddingRight }
  }, [])
}

function QuickViewPanel({ slug, place, board, onClose }: { slug: string; place: number; board: 'support' | 'people' | null; onClose: () => void }) {
  const { data: server, loading, error, reload } = useServer(slug)
  const panel = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<Element | null>(document.activeElement)
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)
  useLockScroll()

  useEffect(() => {
    closeBtn.current?.focus({ preventScroll: true })
    const restore = returnFocus.current
    return () => { if (restore instanceof HTMLElement) restore.focus({ preventScroll: true }) }
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab' || !panel.current) return
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => { if (server) track(server.id, 'VIEW', 'quickview') }, [server])

  // Phones: pull the sheet down by its handle to close it.
  const drag = {
    onTouchStart: (event: React.TouchEvent) => { dragStart.current = event.touches[0].clientY },
    onTouchMove: (event: React.TouchEvent) => { if (dragStart.current !== null) setDragY(Math.max(0, event.touches[0].clientY - dragStart.current)) },
    onTouchEnd: () => { if (dragY > 110) onClose(); dragStart.current = null; setDragY(0) },
  }

  return <div className="gs-qv" role="presentation">
    <button type="button" className="gs-qv-backdrop" aria-label="Закрыть карточку сервера" tabIndex={-1} onClick={onClose} />
    <div ref={panel} className={`gs-qv-panel ${place ? `gs-qv-top gs-qv-top-${place}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="gs-qv-title" data-game={server?.gameId} style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } as CSSProperties : undefined}>
      <div className="gs-qv-grab" {...drag} aria-hidden="true"><span /></div>
      <button ref={closeBtn} type="button" className="gs-qv-close" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
      {server ? <QuickViewBody server={server} drag={drag} place={place} board={board} />
        : loading ? <QuickViewSkeleton />
        : <div className="gs-qv-state"><h2 id="gs-qv-title">{error ? 'Не удалось загрузить сервер' : 'Сервер не найден'}</h2><p>{error ? 'Проверьте соединение и попробуйте ещё раз.' : 'Возможно, его убрали из каталога.'}</p>{error && <button type="button" className="gs-qv-btn" onClick={reload}>Повторить</button>}</div>}
    </div>
  </div>
}

function QuickViewSkeleton() {
  return <div className="gs-qv-skeleton" role="status" aria-label="Загружаем сервер"><span className="gs-qv-sk gs-qv-sk-cover" /><span className="gs-qv-sk gs-qv-sk-line" /><span className="gs-qv-sk gs-qv-sk-line short" /><span className="gs-qv-sk gs-qv-sk-box" /><span className="gs-qv-sk gs-qv-sk-box" /></div>
}

/** Who counted the number, in words a player understands (no host:port strings). */
function countedBy(server: GameServer) {
  const { status, source, sourceTier } = server.online
  if (status === OnlineStatus.External) return source || 'внешний мониторинг'
  if (status === OnlineStatus.OwnerReported) return sourceTier === 'OFFICIAL' ? 'сайт проекта' : 'данные проекта'
  if (status === OnlineStatus.Verified) return 'GameScout'
  if (status === OnlineStatus.Live) return 'ответ сервера'
  return source || 'источник не указан'
}

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function QuickViewBody({ server, drag, place = 0, board = null }: { server: GameServer; drag: Record<string, unknown>; place?: number; board?: 'support' | 'people' | null }) {
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const art = serverArt(server) ?? worldArt('hero', server.gameId, chronicle?.id)
  // Top 1–3 of a rating: the same place scene, character and medal as on the podium.
  const scene = place ? gamePlaceScene(server.gameId, board ?? 'support', place) : undefined
  const medal = place ? (server.gameId === 'minecraft' || server.gameId === 'gtarp' ? `/media/ranks/${server.gameId}-rank-${place}-approved-v1.webp` : `/media/ranks/medal-${place}-glass-192.webp`) : ''
  const placeLabel = place ? `Топ-${place} · ${board === 'people' ? 'Выбор игроков' : board === 'support' ? 'Лидеры поддержки' : 'по онлайну в каталоге'}` : ''
  const { has, toggle } = useFavorites()
  const favorite = has(server.slug)
  const [copied, setCopied] = useState<'ip' | 'link' | null>(null)
  const [more, setMore] = useState(false)
  const { data: similar = [] } = useSimilarServers(server.slug, 3)
  const upcoming = !!server.launch && Date.parse(server.launch.at) > Date.now()
  const live = hasFreshOnline(server)
  const rates = server.rates ? (/^x/i.test(server.rates) ? server.rates : `x${server.rates}`) : null
  const description = server.descriptionRestricted ? '' : cleanText(server.description || server.summary || '')
  const facts = ([
    [server.gameId === 'lineage2' ? 'Хроника' : 'Версия', server.version],
    ['Рейты', rates],
    ['Режимы', server.modes.join(', ')],
    ['Языки', server.languages.join(', ')],
    ['Регион', [server.region, server.country].filter(Boolean).join(', ')],
    ['Открыт', server.openedAt && Date.parse(server.openedAt) <= Date.now() ? `${formatDate(server.openedAt)} · ${formatAge(server.openedAt)}` : ''],
    ['В каталоге с', server.addedAt ? formatDate(server.addedAt) : ''],
  ] as Array<[string, string | null | undefined]>).filter((row): row is [string, string] => !!row[1])
  const summary = [`${game.name}${chronicle ? ` · ${chronicle.label}` : server.version ? ` · ${server.version}` : ''}${rates ? `, рейты ${rates}` : ''}.`, server.modes.length ? `Режимы: ${server.modes.join(', ')}.` : ''].filter(Boolean).join(' ')

  const copy = async (text: string, kind: 'ip' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      if (kind === 'ip') track(server.id, 'PLAY_CLICK', 'copy-address-quickview')
      setTimeout(() => setCopied(null), 1800)
    } catch { /* clipboard blocked: the address stays visible */ }
  }
  const share = async () => {
    const url = `${window.location.origin}/server/${server.slug}`
    try { if (navigator.share) return await navigator.share({ title: server.name, url }) } catch (error) { if ((error as Error)?.name === 'AbortError') return }
    copy(url, 'link')
  }
  const primary: ReactNode = server.address && !upcoming
    ? <button type="button" className="gs-qv-btn gs-qv-btn-primary gs-qv-ip" onClick={() => copy(server.address!, 'ip')} aria-label={`Скопировать адрес ${server.address}`}>{copied === 'ip' ? <Check size={18} /> : <Copy size={18} />}<span className="gs-qv-ip-text">{copied === 'ip' ? 'Адрес скопирован' : server.address}</span></button>
    : server.links.site
      ? <a className="gs-qv-btn gs-qv-btn-primary" href={server.links.site} target="_blank" rel="noopener noreferrer" onClick={() => track(server.id, 'WEBSITE_CLICK', 'quickview')}><Globe size={18} />{server.gameId === 'gtarp' ? 'Как начать играть' : 'Сайт проекта'}<ExternalLink size={15} /></a>
      : null

  return <>
    <header className={`gs-qv-cover ${scene ? 'gs-qv-cover-top' : ''}`} {...drag}>
      {scene ? <img src={scene.bg} alt="" decoding="async" /> : art && <img src={artSrc(art, 800)} alt="" decoding="async" style={{ objectPosition: art.focus.mobile } as CSSProperties} />}
      {scene?.hero && <img className="gs-qv-hero" src={scene.hero} alt="" aria-hidden="true" decoding="async" />}
      {place > 0 && <div className="gs-qv-place"><img src={medal} alt={`${place} место`} /><span>{placeLabel}</span></div>}
      <div className="gs-qv-cover-body">
        <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} src={server.logoUrl} size="lg" forceGameGlyph className="gs-qv-logo" />
        <div className="gs-qv-title">
          <p className="gs-qv-kicker">{[game.shortName ?? game.name, chronicle?.label ?? server.version, rates].filter(Boolean).join(' · ')}</p>
          <h2 id="gs-qv-title">{server.name}</h2>
        </div>
      </div>
    </header>

    <div className="gs-qv-scroll">
      <div className="gs-qv-actions">
        {primary}
        <button type="button" className={`gs-qv-icon ${favorite ? 'is-on' : ''}`} aria-pressed={favorite} aria-label={favorite ? 'Убрать из избранного' : 'В избранное'} onClick={() => toggle(server.slug)}><Heart size={19} fill={favorite ? 'currentColor' : 'none'} /></button>
        <button type="button" className="gs-qv-icon" aria-label="Поделиться" onClick={share}>{copied === 'link' ? <Check size={19} /> : <Share2 size={19} />}</button>
      </div>
      {copied === 'link' && <p className="gs-qv-toast" role="status">Ссылка на сервер скопирована</p>}

      <section className="gs-qv-stats" aria-label="Онлайн и даты">
        {upcoming ? <div className="gs-qv-stat gs-qv-stat-wide gs-qv-stat-launch"><small>Открытие</small><b>{formatLaunch(server.launch!.at)}</b><span><LaunchCountdown at={server.launch!.at} /></span></div>
          : <div className="gs-qv-stat gs-qv-stat-wide">
            <small><i className={live ? 'gs-qv-dot is-live' : 'gs-qv-dot'} />Онлайн сейчас</small>
            {live ? <><b>{formatPlayers(server.online)}{server.online.maxKnown ? <em> / {formatSlots(server.online)}</em> : null}</b><span>Посчитал: {countedBy(server)} · {formatSeconds(server.online.observedAgoSec ?? server.online.checkedAgoSec)}{server.online.sourceUrl ? <> · <a href={server.online.sourceUrl} target="_blank" rel="noopener noreferrer">проверить</a></> : null}</span></>
              : <><b className="gs-qv-muted">нет данных</b><span>Источник сейчас не сообщает число игроков. Как только сообщит — покажем с подписью, кто посчитал.</span></>}
          </div>}
        {live && server.online.peak24h > 0 && <div className="gs-qv-stat"><small>Пик за сутки</small><b>{formatNumber(server.online.peak24h)}</b></div>}
        {live && server.online.avg7d > 0 && <div className="gs-qv-stat"><small>Среднее за 7 дней</small><b>{formatNumber(server.online.avg7d)}</b></div>}
        {server.votes > 0 && <div className="gs-qv-stat"><small>Голоса игроков</small><b>{formatNumber(server.votes)}</b></div>}
        {!upcoming && server.openedAt && Date.parse(server.openedAt) <= Date.now() && <div className="gs-qv-stat"><small>Работает</small><b>{formatAge(server.openedAt)}</b></div>}
      </section>

      <section className="gs-qv-section">
        <h3>О сервере</h3>
        <p className={`gs-qv-desc ${more ? 'is-open' : ''}`}>{server.descriptionRestricted ? 'Описание временно скрыто на время проверки обращения правообладателя.' : description || summary}</p>
        {description.length > 220 && <button type="button" className="gs-qv-link" onClick={() => setMore(v => !v)}>{more ? 'Свернуть' : 'Читать полностью'}</button>}
        {!description && !server.descriptionRestricted && <p className="gs-qv-note">Собрано GameScout по открытым данным. Владелец может добавить своё описание.</p>}
      </section>

      {!upcoming && <section className="gs-qv-section gs-qv-vote"><VotePanel server={server} anchor={false} /></section>}

      {facts.length > 0 && <section className="gs-qv-section">
        <h3>Характеристики</h3>
        <dl className="gs-qv-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </section>}

      {(server.links.site || server.links.discord || server.links.telegram) && <section className="gs-qv-section">
        <h3>Ссылки проекта</h3>
        <div className="gs-qv-links">
          {server.links.site && <a href={server.links.site} target="_blank" rel="noopener noreferrer" onClick={() => track(server.id, 'WEBSITE_CLICK', 'quickview')}><Globe size={17} />Сайт<ExternalLink size={14} /></a>}
          {server.links.discord && <a href={server.links.discord} target="_blank" rel="noopener noreferrer"><MessageSquare size={17} />Discord<ExternalLink size={14} /></a>}
          {server.links.telegram && <a href={server.links.telegram} target="_blank" rel="noopener noreferrer"><Send size={17} />Telegram<ExternalLink size={14} /></a>}
        </div>
      </section>}

      {similar.length > 0 && <section className="gs-qv-section">
        <h3>Похожие серверы</h3>
        <div className="gs-qv-similar">{similar.map(item => <Link key={item.id} to={`/server/${item.slug}`} className="gs-qv-similar-row">
          <ServerLogo name={item.name} hue={item.hue} gameId={item.gameId} src={item.logoUrl} size="sm" forceGameGlyph />
          <span className="gs-qv-similar-txt"><b>{item.name}</b><small>{[chronicleOfVersion(item.gameId, item.version)?.label ?? item.version, item.rates ? `x${String(item.rates).replace(/^[x×]/i, '')}` : ''].filter(Boolean).join(' · ')}</small></span>
          <span className="gs-qv-similar-num">{hasFreshOnline(item) ? formatPlayers(item.online) : '—'}</span>
        </Link>)}</div>
      </section>}
    </div>

    <footer className="gs-qv-foot">
      <Link to={`/server/${server.slug}${board ? `?ranking=${board}` : ''}`} data-full-page className="gs-qv-btn gs-qv-btn-primary gs-qv-btn-full">Полная страница сервера<ArrowRight size={17} /></Link>
    </footer>
  </>
}
