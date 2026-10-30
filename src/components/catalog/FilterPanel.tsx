import { SelectMenu } from '@/components/ui/SelectMenu'
import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { GAMES } from '@/data/games'
import type { CatalogFilters } from '@/services'
import { useFacets, useServers } from '@/hooks/data'
import { Checkbox, ChipToggle, RangeSlider, Toggle } from '@/components/ui/controls'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function Group({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('border-t border-white/6 py-5 first:border-t-0 first:pt-0', className)}>
      <h4 className="mb-3 text-[11px] font-medium tracking-[0.12em] text-ink-500 uppercase">{title}</h4>
      {children}
    </div>
  )
}

export function FilterPanel({
  filters,
  onChange,
  onReset,
  showReset = true,
}: {
  filters: CatalogFilters
  onChange: (next: CatalogFilters) => void
  onReset: () => void
  showReset?: boolean
}) {
  // Facets come from the catalogue itself, so the panel never has to know
  // which values exist — the API answers that.
  const {game:world}=useWorldNavigation()
  const { data: facets } = useFacets(world?.id)
  const { data: allServers = [] } = useServers({ limit: 500 })

  const gameCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const server of allServers) counts[server.gameId] = (counts[server.gameId] ?? 0) + 1
    return counts
  }, [allServers])

  const versions = useMemo(() => {
    const all = facets?.versions ?? []
    // Until the full list arrives the facet versions stand as they are (an empty group would jump later).
    if (!filters.games.length || !allServers.length) return all
    const set = new Set(allServers.filter((s) => filters.games.includes(s.gameId)).map((s) => s.version))
    return all.filter((v) => set.has(v))
  }, [facets, allServers, filters.games])

  const patch = (next: Partial<CatalogFilters>) => onChange({ ...filters, ...next })

  return (
    <div className="gs-filter-panel">
      <div className="mt-2">
        {!world&&<Group title="Игра">
          <div className="-mx-2 space-y-0.5">
            {GAMES.filter((game) => gameCounts[game.id]).map((game) => (
              <Checkbox
                key={game.id}
                checked={filters.games.includes(game.id)}
                onChange={() => patch({ games: toggleValue(filters.games, game.id), versions: [] })}
                count={gameCounts[game.id]}
                label={
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: game.accent }} />
                    {game.shortName}
                  </span>
                }
              />
            ))}
          </div>
        </Group>}

        <Group title={world?.id==='lineage2'?'Хроники':'Версия'}>
          <div className="flex flex-wrap gap-2">
            {/* Placeholder chips hold the group's height until the catalogue answers, so the sheet does not jump. */}
            {!facets && Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true" className="skeleton h-8 w-24 rounded-full" />)}
            {versions.map((version) => (
              <ChipToggle
                key={version}
                active={filters.versions.includes(version)}
                onClick={() => patch({ versions: toggleValue(filters.versions, version) })}
              >
                {version}
              </ChipToggle>
            ))}
          </div>
        </Group>

        {world?.id!=='lineage2' && (facets?.modes?.length ?? 0) > 0 && <Group title="Режим">
          <div className="flex max-h-[184px] flex-wrap gap-2 overflow-y-auto pr-1">
            {(facets?.modes ?? []).map((mode) => (
              <ChipToggle
                key={mode}
                active={filters.modes.includes(mode)}
                onClick={() => patch({ modes: toggleValue(filters.modes, mode) })}
              >
                {mode}
              </ChipToggle>
            ))}
          </div>
        </Group>}

        {(facets?.regions?.length ?? 0) > 0 && <Group title="Регион">
          <div className="flex flex-wrap gap-2">
            {(facets?.regions ?? []).map((region) => (
              <ChipToggle
                key={region}
                active={filters.regions.includes(region)}
                onClick={() => patch({ regions: toggleValue(filters.regions, region) })}
              >
                {region}
              </ChipToggle>
            ))}
          </div>
        </Group>}

        {(!facets || (facets.languages?.length ?? 0) > 0) && <Group title="Язык">
          <div className="flex flex-wrap gap-2">
            {!facets && Array.from({ length: 4 }, (_, index) => <span key={index} aria-hidden="true" className="skeleton h-8 w-24 rounded-full" />)}
            {(facets?.languages ?? []).map((language) => (
              <ChipToggle
                key={language}
                active={filters.languages.includes(language)}
                onClick={() => patch({ languages: toggleValue(filters.languages, language) })}
              >
                {language}
              </ChipToggle>
            ))}
          </div>
        </Group>}

        <Group title="Онлайн">
          <RangeSlider
            value={filters.minOnline}
            onChange={(minOnline) => patch({ minOnline })}
            min={0}
            max={2500}
            step={50}
            formatValue={(value) => (value === 0 ? 'любой' : `от ${formatNumber(value)}`)}
          />
        </Group>

        <Group title="Рейтинг">
          <div className="flex flex-wrap gap-2">
            {[0, 4, 4.5].map((value) => (
              <ChipToggle
                key={value}
                active={filters.minRating === value}
                onClick={() => patch({ minRating: value })}
              >
                {value === 0 ? 'Любой' : `от ${value.toFixed(1).replace('.', ',')}`}
              </ChipToggle>
            ))}
          </div>
        </Group>

        <Group title="Дата открытия">
          <SelectMenu
            label="Дата открытия"
            value={filters.openedWithin}
            onChange={(value) => patch({ openedWithin: value as CatalogFilters['openedWithin'] })}
            options={[
              { value: 'any', label: 'Любая' },
              { value: '30d', label: 'За последние 30 дней' },
              { value: '90d', label: 'За последние 3 месяца' },
              { value: '365d', label: 'За последний год' },
            ]}
          />
        </Group>

        <Group title="Дополнительно">
          <div className="space-y-3">
            <Toggle
              checked={filters.wipeSoon}
              onChange={(wipeSoon) => patch({ wipeSoon })}
              label="Скоро вайп"
              description="Вайп в ближайшие 10 дней"
            />
            <Toggle
              checked={filters.hideOffline}
              onChange={(hideOffline) => patch({ hideOffline })}
              label="Скрыть offline"
              description="Не показывать серверы, которые не отвечают"
            />
          </div>
        </Group>
      </div>

      {showReset && (
        <button
          onClick={onReset}
          className="mt-2 inline-flex items-center gap-2 text-[13px] text-ink-400 transition-colors hover:text-ink-100"
        >
          <RotateCcw size={13} />
          Сбросить фильтры
        </button>
      )}
    </div>
  )
}
