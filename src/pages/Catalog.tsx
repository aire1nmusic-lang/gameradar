import { RankMedal } from '@/components/ui/RankMedal'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { useSupportRotation } from '@/hooks/useSupportRotation'
import { useVisualDemo } from '@/hooks/useVisualDemo'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { WorldIcon } from '@/components/icons/WorldIcon'
import { cn } from '@/lib/utils'
import { formatNumber, plural } from '@/lib/format'
import { GAMES_BY_ID } from '@/data/games'
import { countActiveFilters, EMPTY_FILTERS, SORT_OPTIONS, toServerQuery, searchServers, peopleSortedServers, supportSortedServers, type CatalogFilters } from '@/services'
import { useAsync } from '@/hooks/data'
import type { SortKey } from '@/models'
import { Container } from '@/components/layout/Container'
import { FilterPanel } from '@/components/catalog/FilterPanel'
import { ServerCard, ServerCardSkeleton } from '@/components/server/ServerCard'
import { ServerRow, ServerRowSkeleton } from '@/components/server/ServerRow'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/overlays'
import { EmptyState, Notice } from '@/components/ui/feedback'
import { ThemeScope } from '@/theme'
import { themeForGame } from '@/data/themes'
import { InlinePromo } from '@/components/ads/AdSlots'
import { useSeo } from '@/lib/seo'
import { useAuth } from '@/hooks/useAuth'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

const PAGE_SIZE = 10
type View = 'list' | 'grid'
const VIEW_KEY = 'gs.catalog.view'
const COMPACT_SORT_LABELS: Record<SortKey, string> = {
  recommended: 'Общий топ', online: 'Онлайн', growth: 'Рост', votes: 'Голоса', support: 'Поддержка', rating: 'Рейтинг', new: 'Новые', launch: 'Открытие',
}

export default function Catalog() {
  const demo=useVisualDemo()
  const {game:world}=useWorldNavigation()
  const { privateCore, loading: authLoading } = useAuth()
  useSeo({ title: 'Каталог игровых серверов', path: '/catalog', description: 'Все серверы в каталоге GameScout: фильтры по игре, хронике, режиму, языку и онлайну. Источник онлайна указан у каждого сервера.' })
  const [params, setParams] = useSearchParams()

  const [filters, setFilters] = useState<CatalogFilters>(() => ({
    ...EMPTY_FILTERS,
    query: params.get('q') ?? '',
    games: params.get('game') ? [params.get('game')!] : [],
    modes: params.get('mode') ? [params.get('mode')!] : [],
    versions: params.get('version') ? [params.get('version')!] : [],
    verifiedOnly: params.get('verified') === '1',
  }))
  const [sort, setSort] = useState<SortKey>((params.get('sort') as SortKey) ?? 'recommended')
  useEffect(() => { if (!authLoading && !privateCore && sort === 'support') setSort('recommended') },[authLoading,privateCore,sort])
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'
    } catch {
      return 'list'
    }
  })
  const adTheme = useMemo(() => themeForGame(filters.games[0] ?? 'core'), [filters.games])
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchOpen,setSearchOpen]=useState(Boolean(params.get('q')))

  const rotateSupport = world?.id === 'lineage2' && sort === 'support'
  const query = useMemo(() => toServerQuery(filters, sort, rotateSupport ? Number.MAX_SAFE_INTEGER : visible), [filters, sort, visible, rotateSupport])
  const { data: page, loading, error, reload } = useAsync(
    () => demo ? searchServers(query,true) : privateCore && sort === 'votes' ? peopleSortedServers(query)
      : privateCore && sort === 'support' ? supportSortedServers(query)
        : searchServers(authLoading && sort === 'support' ? {...query,sort:'recommended'} : query),
    [JSON.stringify(query),privateCore,authLoading,demo], true)
  const supportRows = useSupportRotation(page?.items ?? [], rotateSupport)
  const results = rotateSupport ? supportRows.slice(0, visible) : page?.items ?? []
  const total = page?.total ?? 0
  // The selected world is context, not a removable filter. Showing it as an
  // active chip made the mobile toolbar look broken because clicking X simply
  // re-added the same game.
  const uiFilters = world ? { ...filters, games: [] } : filters
  const activeCount = countActiveFilters(uiFilters)

  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [filters, sort])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // a private window forgets the preference; the default is fine
    }
  }, [view])

  /*
   * URL ⇄ state stays two-way: we write the params we own and remember what
   * we wrote; any other change of the address re-hydrates the filters.
   */
  const ownWrite = useRef('')

  useEffect(() => {
    const next = new URLSearchParams()
    if (filters.query) next.set('q', filters.query)
    if (filters.games.length === 1) next.set('game', filters.games[0])
    if (filters.modes.length === 1) next.set('mode', filters.modes[0])
    if (filters.versions.length === 1) next.set('version', filters.versions[0])
    if (filters.verifiedOnly) next.set('verified', '1')
    if (sort !== 'recommended') next.set('sort', sort)
    ownWrite.current = next.toString()
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.query, filters.games, filters.modes, filters.versions, filters.verifiedOnly, sort])

  useEffect(() => {
    const current = params.toString()
    if (current === ownWrite.current) return
    ownWrite.current = current
    setFilters((prev) => ({
      ...prev,
      query: params.get('q') ?? '',
      games: params.get('game') ? [params.get('game')!] : [],
      modes: params.get('mode') ? [params.get('mode')!] : [],
      versions: params.get('version') ? [params.get('version')!] : [],
      verifiedOnly: params.get('verified') === '1',
    }))
    setSort((params.get('sort') as SortKey) ?? 'recommended')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const reset = () => setFilters({ ...EMPTY_FILTERS, games:world?[world.id]:[],query: filters.query })
  const chips = buildChips(uiFilters, next=>setFilters(world?{...next,games:[world.id]}:next))

  return (
    <div className="gs-catalog-page pb-16">
      <Container className="pt-6 lg:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[26px] leading-tight sm:text-[30px]">Серверы{world?` · ${world.shortName}`:''}</h1>
          <span className="num text-[13px] text-ink-400">
            {loading&&!page?'Загружаем серверы…':error?(page?'Предыдущие результаты · обновление недоступно':'Данные недоступны'):
              `${formatNumber(total)} ${plural(total, ['сервер', 'сервера', 'серверов'])}`}
          </span>
        </div>

        <div className={(searchOpen?'gs-catalog-search is-open ':'gs-catalog-search ')+"mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900 p-1.5 pl-4 focus-within:border-white/22"}>

          <input
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            placeholder="Название сервера, игра, режим…"
            className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-ink-50 placeholder:text-ink-500 focus:outline-none"
          />
          {filters.query && (
            <button onClick={() => setFilters({ ...filters, query: '' })} aria-label="Очистить" className="grid h-8 w-8 place-items-center rounded-md text-ink-400 hover:bg-white/6 hover:text-ink-50">
              <WorldIcon name="close" size={16} />
            </button>
          )}
        </div>
      </Container>

      {/* the toolbar follows the list: filters, active chips, sort, view */}
      <div className="gs-catalog-toolbar sticky top-[60px] z-30 mt-3 border-y border-white/[0.07] bg-ink-950/92 py-2 backdrop-blur-md">
        <Container className="flex items-center gap-2">
          <button type="button" className="gs-catalog-search-toggle" aria-label="Поиск серверов" aria-expanded={searchOpen} onClick={()=>setSearchOpen(!searchOpen)}><WorldIcon name={searchOpen?'close':'search'} size={17}/></button>
          <button
            onClick={() => setFiltersOpen(true)}
            className="gs-filter-trigger inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-[13px] text-ink-100 transition-colors hover:border-white/20"
          >
            <WorldIcon name="filter" size={14} />
            Фильтры
            {activeCount > 0 && (
              <span className="num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-signal-500 px-1 text-[10px] font-semibold text-ink-950">{activeCount}</span>
            )}
          </button>

          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {chips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.remove}
                className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] py-1 pr-2 pl-3 text-[12.5px] text-ink-200 transition-colors hover:border-white/20"
              >
                {chip.label}
                <WorldIcon name="close" size={12} className="text-ink-500 group-hover:text-ink-200" />
              </button>
            ))}
            {chips.length > 1 && (
              <button onClick={reset} className="shrink-0 px-2 text-[12.5px] text-ink-400 hover:text-ink-100">
                Сбросить
              </button>
            )}
          </div>

          <SelectMenu
            value={sort}
            onChange={(value) => setSort(value as SortKey)}
            options={SORT_OPTIONS.filter(option=>privateCore||option.key!=='support').map((option) => ({ value: option.key, label: COMPACT_SORT_LABELS[option.key] }))}
            className="w-[130px] shrink-0 sm:w-[150px] [&_select]:h-9 [&_select]:text-[13px]"
          />

          <div className="hidden shrink-0 items-center rounded-md border border-white/10 bg-white/[0.03] p-0.5 sm:flex">
            <ViewButton active={view === 'list'} onClick={() => setView('list')} label="Список">
              <WorldIcon name="list" size={15} />
            </ViewButton>
            <ViewButton active={view === 'grid'} onClick={() => setView('grid')} label="Плитка">
              <WorldIcon name="grid" size={15} />
            </ViewButton>
          </div>
        </Container>
      </div>

      <Container className="mt-4">
        {results.some(s=>s.rankingAvailability && (!s.rankingAvailability.votes || !s.rankingAvailability.support)) && <p className="gs-ranking-availability" role="status">Рейтинг временно недоступен</p>}
        {error ? (
          <Notice tone="warn">Не удалось загрузить каталог. <Button variant="outline" onClick={reload}>Повторить</Button></Notice>
        ) : loading && !page ? (
          view === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <ServerCardSkeleton key={index} />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {Array.from({ length: 10 }).map((_, index) => (
                <ServerRowSkeleton key={index} />
              ))}
            </div>
          )
        ) : results.length === 0 ? (
          <EmptyState
            title="По этим фильтрам ничего не нашлось"
            description="Попробуйте убрать часть условий — например, ограничение по онлайну или требование проверенных данных."
            action="Сбросить фильтры"
            onAction={reset}
            secondary={
              <Button variant="outline" to="/openings">
                Посмотреть открытия
              </Button>
            }
          />
        ) : (
          <>
            {view === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((server, index) => (
                  <Fragment key={server.slug}>
                    {index === 6 && (
                      <ThemeScope theme={adTheme} as="div" className="sm:col-span-2 xl:col-span-3">
                        <InlinePromo gameId={filters.games[0]} />
                      </ThemeScope>
                    )}
                    <div className="relative">{['recommended','online','votes','support','growth','rating'].includes(sort) && <RankMedal rank={index+1} className="absolute top-3 right-3 z-10"/>}<ServerCard server={server} /></div>
                  </Fragment>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {results.map((server, index) => (
                  <ServerRow key={server.slug} server={server} rank={['recommended','online','votes','support','growth','rating'].includes(sort) ? index+1 : undefined} metric={sort==='support'?'support':sort==='votes'?'votes':'auto'} showGame={!world} />
                ))}
              </div>
            )}

            {visible < total && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <Button variant="secondary" size="lg" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Показать ещё {Math.min(PAGE_SIZE, total - visible)}
                </Button>
                <span className="num text-[12.5px] text-ink-500">
                  {results.length} из {formatNumber(total)}
                </span>
              </div>
            )}
          </>
        )}
      </Container>

      <Sheet
        className={world?.id==='lineage2'?'gs-l2-filter-sheet':undefined}
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Фильтры"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset} className="flex-1">
              Сбросить
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)} className="flex-[2]">
              Показать {formatNumber(total)}
            </Button>
          </div>
        }
      >
        <FilterPanel filters={filters} onChange={setFilters} onReset={reset} showReset={false} />
      </Sheet>
    </div>
  )
}

function ViewButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn('grid h-8 w-8 place-items-center rounded-[5px] transition-colors', active ? 'bg-white/10 text-ink-50' : 'text-ink-400 hover:text-ink-100')}
    >
      {children}
    </button>
  )
}

function buildChips(filters: CatalogFilters, setFilters: (next: CatalogFilters) => void) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = []
  for (const game of filters.games) chips.push({ key: `game-${game}`, label: GAMES_BY_ID[game]?.shortName ?? game, remove: () => setFilters({ ...filters, games: filters.games.filter((g) => g !== game) }) })
  for (const version of filters.versions) chips.push({ key: `version-${version}`, label: version, remove: () => setFilters({ ...filters, versions: filters.versions.filter((v) => v !== version) }) })
  for (const mode of filters.modes) chips.push({ key: `mode-${mode}`, label: mode, remove: () => setFilters({ ...filters, modes: filters.modes.filter((m) => m !== mode) }) })
  for (const region of filters.regions) chips.push({ key: `region-${region}`, label: region, remove: () => setFilters({ ...filters, regions: filters.regions.filter((r) => r !== region) }) })
  for (const language of filters.languages) chips.push({ key: `lang-${language}`, label: language, remove: () => setFilters({ ...filters, languages: filters.languages.filter((l) => l !== language) }) })
  if (filters.verifiedOnly) chips.push({ key: 'VERIFIED', label: 'Verified online', remove: () => setFilters({ ...filters, verifiedOnly: false }) })
  if (filters.minOnline > 0) chips.push({ key: 'online', label: `Онлайн от ${formatNumber(filters.minOnline)}`, remove: () => setFilters({ ...filters, minOnline: 0 }) })
  if (filters.minRating > 0) chips.push({ key: 'rating', label: `Рейтинг от ${filters.minRating.toFixed(1).replace('.', ',')}`, remove: () => setFilters({ ...filters, minRating: 0 }) })
  if (filters.wipeSoon) chips.push({ key: 'wipe', label: 'Скоро вайп', remove: () => setFilters({ ...filters, wipeSoon: false }) })
  if (filters.hideOffline) chips.push({ key: 'OFFLINE', label: 'Без offline', remove: () => setFilters({ ...filters, hideOffline: false }) })
  if (filters.openedWithin !== 'any') chips.push({ key: 'opened', label: 'По дате открытия', remove: () => setFilters({ ...filters, openedWithin: 'any' }) })
  return chips
}
