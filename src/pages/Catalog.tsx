import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpDown, ArrowUpRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, plural } from '@/lib/format'
import { GAMES_BY_ID } from '@/data/games'
import {
  countActiveFilters,
  EMPTY_FILTERS,
  filterServers,
  sortServers,
  SORT_OPTIONS,
  type CatalogFilters,
  type SortKey,
} from '@/data/catalog'
import { Container } from '@/components/layout/Container'
import { FilterPanel } from '@/components/catalog/FilterPanel'
import { ServerCard, ServerCardSkeleton } from '@/components/server/ServerCard'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/overlays'
import { Segmented } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'

const PAGE_SIZE = 12

export default function Catalog() {
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
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  const results = useMemo(() => sortServers(filterServers(filters), sort), [filters, sort])
  const activeCount = countActiveFilters(filters)

  useEffect(() => {
    setLoading(true)
    setVisible(PAGE_SIZE)
    const timer = window.setTimeout(() => setLoading(false), 320)
    return () => window.clearTimeout(timer)
  }, [filters, sort])

  useEffect(() => {
    const next = new URLSearchParams()
    if (filters.query) next.set('q', filters.query)
    if (filters.games.length === 1) next.set('game', filters.games[0])
    if (filters.verifiedOnly) next.set('verified', '1')
    if (sort !== 'recommended') next.set('sort', sort)
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.query, filters.games, filters.verifiedOnly, sort])

  const reset = () => setFilters({ ...EMPTY_FILTERS, query: filters.query })

  const chips = buildChips(filters, setFilters)

  return (
    <div className="pb-16">
      <Container className="pt-8 lg:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight sm:text-[34px]">Каталог серверов</h1>
            <p className="mt-2 max-w-xl text-[14px] text-ink-300">
              {formatNumber(results.length)} {plural(results.length, ['сервер', 'сервера', 'серверов'])} по вашему
              запросу. Онлайн у отмеченных проектов проверяет GameRadar.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 rounded-xl border border-white/9 bg-ink-900/70 p-2 pl-4 backdrop-blur-sm focus-within:border-white/20">
          <Search size={18} className="shrink-0 text-ink-400" />
          <input
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            placeholder="Название сервера, игра, режим…"
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-ink-50 placeholder:text-ink-500 focus:outline-none"
          />
          {filters.query && (
            <button
              onClick={() => setFilters({ ...filters, query: '' })}
              aria-label="Очистить"
              className="grid h-8 w-8 place-items-center rounded-md text-ink-400 hover:bg-white/6 hover:text-ink-50"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </Container>

      {/* mobile toolbar */}
      <div className="sticky top-14 z-40 mt-4 glass border-y border-white/7 py-2.5 lg:hidden">
        <Container className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen(true)}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] text-[13px] text-ink-100"
          >
            <SlidersHorizontal size={14} />
            Фильтры
            {activeCount > 0 && (
              <span className="num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-signal-500 px-1 text-[10px] font-semibold text-ink-950">
                {activeCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setSortOpen(true)}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] text-[13px] text-ink-100"
          >
            <ArrowUpDown size={14} />
            {SORT_OPTIONS.find((option) => option.key === sort)?.label}
          </button>
        </Container>
      </div>

      <Container className="mt-6 lg:mt-8">
        <div className="lg:grid lg:grid-cols-[270px_1fr] lg:gap-8 xl:grid-cols-[286px_1fr] xl:gap-10">
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 pb-6">
              <FilterPanel filters={filters} onChange={setFilters} onReset={reset} />
              <AdSlot />
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-4 hidden flex-wrap items-center justify-between gap-3 lg:flex">
              <div className="flex flex-wrap items-center gap-2">
                {chips.length > 0 ? (
                  <>
                    {chips.map((chip) => (
                      <button
                        key={chip.key}
                        onClick={chip.remove}
                        className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] py-1 pr-2 pl-3 text-[12.5px] text-ink-200 transition-colors hover:border-white/20"
                      >
                        {chip.label}
                        <X size={12} className="text-ink-500 group-hover:text-ink-200" />
                      </button>
                    ))}
                    <button onClick={reset} className="px-2 text-[12.5px] text-ink-400 hover:text-ink-100">
                      Сбросить всё
                    </button>
                  </>
                ) : (
                  <span className="text-[13px] text-ink-400">
                    Найдено {formatNumber(results.length)}{' '}
                    {plural(results.length, ['сервер', 'сервера', 'серверов'])}
                  </span>
                )}
              </div>

              <Segmented
                value={sort}
                onChange={(value) => setSort(value)}
                size="sm"
                options={SORT_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
              />
            </div>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <ServerCardSkeleton key={index} />
                ))}
              </div>
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
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {results.slice(0, visible).map((server) => (
                    <ServerCard key={server.slug} server={server} />
                  ))}
                </div>

                {visible < results.length && (
                  <div className="mt-8 flex flex-col items-center gap-3">
                    <Button variant="secondary" size="lg" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                      Показать ещё {Math.min(PAGE_SIZE, results.length - visible)}
                    </Button>
                    <span className="num text-[12.5px] text-ink-500">
                      {Math.min(visible, results.length)} из {results.length}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Container>

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Фильтры"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset} className="flex-1">
              Сбросить
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)} className="flex-[2]">
              Показать {formatNumber(results.length)}
            </Button>
          </div>
        }
      >
        <FilterPanel filters={filters} onChange={setFilters} onReset={reset} showReset={false} />
      </Sheet>

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Сортировка" maxHeight="60vh">
        <div className="space-y-1 pb-2">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => {
                setSort(option.key)
                setSortOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[14px] transition-colors',
                sort === option.key ? 'bg-white/8 text-ink-50' : 'text-ink-300 hover:bg-white/5',
              )}
            >
              {option.label}
              {sort === option.key && <span className="h-1.5 w-1.5 rounded-full bg-signal-400" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

/** Future banner inventory, shown honestly as a labelled placeholder. */
function AdSlot() {
  return (
    <Link
      to="/owners#promo"
      className="mt-6 block overflow-hidden rounded-xl border border-promo-500/20 bg-promo-900/20 p-4 transition-colors hover:border-promo-500/35"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-[0.12em] text-promo-300/80 uppercase">
          Рекламное место
        </span>
        <span className="text-[10px] tracking-[0.08em] text-ink-500 uppercase">Banner</span>
      </div>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-200">
        Здесь может быть ваш сервер. Баннерные размещения всегда помечены и не влияют на рейтинг.
      </p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-promo-200">
        Узнать о продвижении
        <ArrowUpRight size={13} />
      </span>
    </Link>
  )
}

function buildChips(filters: CatalogFilters, setFilters: (next: CatalogFilters) => void) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = []

  for (const game of filters.games) {
    chips.push({
      key: `game-${game}`,
      label: GAMES_BY_ID[game]?.shortName ?? game,
      remove: () => setFilters({ ...filters, games: filters.games.filter((g) => g !== game) }),
    })
  }
  for (const version of filters.versions) {
    chips.push({
      key: `version-${version}`,
      label: version,
      remove: () => setFilters({ ...filters, versions: filters.versions.filter((v) => v !== version) }),
    })
  }
  for (const mode of filters.modes) {
    chips.push({
      key: `mode-${mode}`,
      label: mode,
      remove: () => setFilters({ ...filters, modes: filters.modes.filter((m) => m !== mode) }),
    })
  }
  for (const region of filters.regions) {
    chips.push({
      key: `region-${region}`,
      label: region,
      remove: () => setFilters({ ...filters, regions: filters.regions.filter((r) => r !== region) }),
    })
  }
  for (const language of filters.languages) {
    chips.push({
      key: `lang-${language}`,
      label: language,
      remove: () => setFilters({ ...filters, languages: filters.languages.filter((l) => l !== language) }),
    })
  }
  if (filters.verifiedOnly) {
    chips.push({
      key: 'verified',
      label: 'Verified online',
      remove: () => setFilters({ ...filters, verifiedOnly: false }),
    })
  }
  if (filters.minOnline > 0) {
    chips.push({
      key: 'online',
      label: `Онлайн от ${formatNumber(filters.minOnline)}`,
      remove: () => setFilters({ ...filters, minOnline: 0 }),
    })
  }
  if (filters.minRating > 0) {
    chips.push({
      key: 'rating',
      label: `Рейтинг от ${filters.minRating.toFixed(1).replace('.', ',')}`,
      remove: () => setFilters({ ...filters, minRating: 0 }),
    })
  }
  if (filters.wipeSoon) {
    chips.push({ key: 'wipe', label: 'Скоро вайп', remove: () => setFilters({ ...filters, wipeSoon: false }) })
  }
  if (filters.hideOffline) {
    chips.push({ key: 'offline', label: 'Без offline', remove: () => setFilters({ ...filters, hideOffline: false }) })
  }
  if (filters.openedWithin !== 'any') {
    chips.push({
      key: 'opened',
      label: 'По дате открытия',
      remove: () => setFilters({ ...filters, openedWithin: 'any' }),
    })
  }

  return chips
}
