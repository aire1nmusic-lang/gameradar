import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import NotFound from './NotFound'
import { ArrowRight, CalendarClock, Flame, LayoutGrid, Plus, Rows3, Trophy } from 'lucide-react'
import { resolveWorld } from '@/data/themes'
import { chronicleOfVersion } from '@/data/games'
import { useServers } from '@/hooks/data'
import type { GameServer } from '@/models'
import { Container } from '@/components/layout/Container'
import { ThemeScope, ThemedButton, ThemedEyebrow, ThemedHeading, useGameTheme } from '@/theme'
import { GameHero } from '@/components/game/GameHero'
import { ChronicleNav } from '@/components/game/ChronicleNav'
import { ServerList, ServerRow, ServerRowSkeleton, ServerTiles } from '@/components/server/ServerRow'
import { RankPanel, ShelfNote } from '@/components/world/Shelves'
import { ChronicleTiles } from '@/components/world/ChronicleTiles'
import { Segmented } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'
import { breadcrumbs, useSeo } from '@/lib/seo'

/**
 * A game world: /minecraft, /lineage-2, /lineage-2/interlude.
 * Same platform, same data, its own key art and palette — and the list of
 * servers on the first screen.
 */
export default function GameWorld() {
  const { gameSlug, chronicleSlug } = useParams()
  const world = resolveWorld(gameSlug, chronicleSlug)
  // Arriving through a gate of the hall: the world opens out of its own colour.
  const fromPortal = !!(useLocation().state as { portal?: boolean } | null)?.portal

  // unknown single-segment url — this route sits below every static route
  if (!world.game) return <NotFound />
  if (chronicleSlug && !world.chronicle) return <Navigate to={`/${world.game.slug}`} replace />

  return (
    <ThemeScope theme={world.theme} as="div" className={fromPortal ? 'gs-world-enter relative' : 'relative'}>
      <WorldBody gameSlug={world.game.slug} chronicleSlug={world.chronicle?.slug} key={`${world.game.slug}-${world.chronicle?.slug ?? 'all'}`} />
    </ThemeScope>
  )
}

type Sort = 'online' | 'new' | 'name'
const WORLD_SORT_KEY = 'gs.world.sort'

function WorldBody({ gameSlug, chronicleSlug }: { gameSlug: string; chronicleSlug?: string }) {
  const theme = useGameTheme()
  const { game, chronicle } = resolveWorld(gameSlug, chronicleSlug)
  const [sort, setSort] = useState<Sort>(() => {
    try {
      const saved = sessionStorage.getItem(WORLD_SORT_KEY)
      return saved === 'new' || saved === 'name' ? saved : 'online'
    } catch {
      return 'online'
    }
  })
  const [limit, setLimit] = useState(12)
  const [panel, setPanel] = useState<'online' | 'soon' | 'choice'>('online')
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try { return localStorage.getItem('gs.view') === 'grid' ? 'grid' : 'list' } catch { return 'list' }
  })
  useEffect(() => {
    try { localStorage.setItem('gs.view', view) } catch { /* optional */ }
  }, [view])
  useEffect(() => {
    try { sessionStorage.setItem(WORLD_SORT_KEY, sort) } catch { /* session storage is optional */ }
  }, [sort])

  const worldName = [game?.name, chronicle?.label].filter(Boolean).join(' ')
  const worldPath = '/' + [game?.slug, chronicle?.slug].filter(Boolean).join('/')
  useSeo({
    title: `Серверы ${worldName}`,
    path: worldPath,
    description: `Серверы ${worldName} в каталоге GameScout: онлайн с указанием источника, открытия, рейтинг и голосование.`,
    jsonLd: [
      breadcrumbs([
        { name: 'GameScout', path: '/' },
        ...(game ? [{ name: game.name, path: '/' + game.slug }] : []),
        ...(game && chronicle ? [{ name: chronicle.label, path: worldPath }] : []),
      ]),
    ],
  })
  const { data: servers = [], loading, error, reload } = useServers({ gameId: game?.id, chronicleId: chronicle?.id, limit: 200 }, true)

  const known = (server: GameServer) => server.online.playersKnown === true && server.online.freshness === 'fresh' && server.online.status !== 'UNKNOWN'
  const openings = useMemo(
    () => servers.filter((server) => server.launch && Date.parse(server.launch.at) > Date.now()).sort((a, b) => Date.parse(a.launch!.at) - Date.parse(b.launch!.at)),
    [servers],
  )
  const rest = useMemo(() => {
    const open = new Set(openings.map((server) => server.slug))
    return servers.filter((server) => !open.has(server.slug))
  }, [servers, openings])
  const topOnline = useMemo(() => rest.filter(known).sort((a, b) => b.online.current - a.online.current), [rest])
  const topChoice = useMemo(
    () => rest.filter((server) => server.votes > 0 || (server.support?.coins ?? 0) > 0)
      .sort((a, b) => b.votes - a.votes || (b.support?.coins ?? 0) - (a.support?.coins ?? 0)),
    [rest],
  )
  const listed = useMemo(() => {
    const byName = (a: GameServer, b: GameServer) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base', numeric: true }) || a.slug.localeCompare(b.slug)
    const openedAt = (server: GameServer) => {
      const parsed = Date.parse(server.openedAt ?? server.launch?.at ?? server.addedAt)
      return Number.isFinite(parsed) ? parsed : 0
    }
    if (sort === 'name') return [...rest].sort(byName)
    // "Новые" means the newest opening, not the import date: imported rows share one addedAt.
    if (sort === 'new') return [...rest].sort((a, b) => openedAt(b) - openedAt(a) || byName(a, b))
    return [...topOnline, ...rest.filter((server) => !known(server))]
  }, [rest, topOnline, sort])
  const counts = useMemo(() => {
    const result: Record<string, { servers: number; online: number }> = {}
    for (const server of servers) {
      const id = server.chronicleId ?? chronicleOfVersion(server.gameId, server.version)?.id
      if (!id) continue
      const entry = (result[id] ??= { servers: 0, online: 0 })
      entry.servers += 1
      if (known(server)) entry.online += server.online.current
    }
    return result
  }, [servers])

  if (!game) return null
  const playersOnline = servers.reduce((sum, server) => sum + (server.online.freshness === 'fresh' ? server.online.current : 0), 0)
  const allKnown = sort === 'online' ? listed.slice(0, topOnline.length) : []
  const allUnknown = sort === 'online' ? listed.slice(topOnline.length) : listed
  const listedKnown = allKnown.slice(0, limit)
  const listedUnknown = allUnknown.slice(0, Math.max(0, limit - listedKnown.length))
  const hiddenCount = listed.length - listedKnown.length - listedUnknown.length

  return (
    <div className="relative" style={{ background: theme.colors.bg, color: theme.colors.text }}>
      {/* No count until the list arrives: a slow or failed request must not read as "0 серверов". */}
      <GameHero game={game} chronicle={chronicle} serversCount={(loading || error) && servers.length === 0 ? undefined : servers.length} playersOnline={playersOnline} openings={openings.length} />

      <Container className="relative pb-16">
        {chronicle ? (
          // inside a chronicle the switcher stays reachable while the list scrolls
          <div className="sticky top-[60px] z-30 -mx-5 px-5 py-2.5 sm:mx-0 sm:px-0" style={{ background: `color-mix(in oklab, ${theme.colors.bg} 92%, transparent)`, backdropFilter: 'blur(12px)' }}>
            <ChronicleNav game={game} chronicles={game.chronicles} />
          </div>
        ) : (
          <div className="mt-6">
            <ChronicleTiles game={game} chronicles={game.chronicles} counts={counts} />
          </div>
        )}

        {loading && servers.length === 0 ? (
          <div className="mt-8 space-y-1.5" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => <ServerRowSkeleton key={index} />)}
          </div>
        ) : error && servers.length === 0 ? (
          // A failed request is not an empty game.
          <div className="mt-8"><EmptyState title="Не удалось загрузить серверы" description="Проверьте соединение и попробуйте ещё раз." action="Повторить" onAction={reload} /></div>
        ) : (
          <>
            <div className="mt-5 lg:hidden">
              <Segmented
                value={panel}
                onChange={setPanel}
                className="w-full [&>*]:flex-1"
                options={[
                  { value: 'online', label: 'Играют' },
                  { value: 'soon', label: 'Скоро' },
                  { value: 'choice', label: 'Выбор' },
                ]}
              />
            </div>
            <div className="mt-3 grid gap-3 lg:mt-6 lg:grid-cols-3">
              <RankPanel
                icon={<Flame size={16} />}
                className={panel === 'online' ? undefined : 'max-lg:hidden'}
                title="Сейчас играют"
                hint={chronicle ? `Топ по онлайну · ${chronicle.label}` : 'Топ по онлайну'}
                to={`/rating?game=${game.id}`}
              >
                {topOnline.length > 0
                  ? topOnline.slice(0, 5).map((server, index) => <ServerRow key={server.slug} server={server} rank={index + 1} showGame={false} compact />)
                  : <ShelfNote title="Живого онлайна пока нет" text="Число игроков появится, когда проект подключит проверку онлайна или мы получим его из открытых источников." />}
              </RankPanel>

              <RankPanel
                icon={<CalendarClock size={16} />}
                className={panel === 'soon' ? undefined : 'max-lg:hidden'}
                title="Скоро открытие"
                hint="Ближайшие старты"
                to={`/openings?game=${game.id}`}
              >
                {openings.length > 0
                  ? openings.slice(0, 5).map((server) => <ServerRow key={server.slug} server={server} showGame={false} compact />)
                  : <ShelfNote title="Ближайших открытий нет" text="Как только проект объявит дату старта, он появится здесь с обратным отсчётом." />}
              </RankPanel>

              <RankPanel className={panel === 'choice' ? undefined : 'max-lg:hidden'} icon={<Trophy size={16} />} title="Выбор игроков" hint="Народный рейтинг и поддержка" to="/rating">
                {topChoice.length > 0
                  ? topChoice.slice(0, 5).map((server, index) => <ServerRow key={server.slug} server={server} rank={index + 1} showGame={false} metric="support" />)
                  : <ShelfNote title="Голосование скоро откроется" text="Первые голоса игроков появятся вместе с открытием регистрации — здесь будут серверы, которых выбрали сами игроки." />}
              </RankPanel>
            </div>

            <section id="all" className="mt-10 scroll-mt-24">
              <SectionHead
                eyebrow={<><Flame size={12} /> Каталог</>}
                title={chronicle ? `Все серверы ${chronicle.label}` : `Все серверы ${game.shortName}`}
                action={{ label: 'Фильтры', to: `/catalog?game=${game.id}` }}
                right={
                  <>
                    <Segmented
                      value={sort}
                      onChange={setSort}
                      size="sm"
                      className="[&_button]:whitespace-nowrap"
                      options={[
                        { value: 'online', label: 'Онлайн' },
                        { value: 'new', label: 'Новые' },
                        { value: 'name', label: 'А–Я' },
                      ]}
                    />
                    <Segmented
                      value={view}
                      onChange={setView}
                      size="sm"
                      options={[
                        { value: 'list', label: <span aria-label="Списком" title="Списком"><Rows3 size={15} /></span> },
                        { value: 'grid', label: <span aria-label="Плитками" title="Плитками"><LayoutGrid size={15} /></span> },
                      ]}
                    />
                  </>
                }
              />
              {listed.length > 0 ? (
                <>
                  {listedKnown.length > 0 && (view === 'grid' ? <ServerTiles servers={listedKnown} ranked showGame={false} /> : <ServerList servers={listedKnown} ranked showGame={false} />)}
                  {listedUnknown.length > 0 && (
                    <>
                      {listedKnown.length > 0 && (
                        <h3 className="mt-6 mb-2 text-[13px] tracking-wide uppercase" style={{ color: theme.colors.textMuted }}>
                          Онлайн пока не измерен · {allUnknown.length}
                        </h3>
                      )}
                      {view === 'grid' ? <ServerTiles servers={listedUnknown} showGame={false} /> : <ServerList servers={listedUnknown} showGame={false} />}
                    </>
                  )}
                  {hiddenCount > 0 && (
                    <div className="mt-4 flex justify-center">
                      <ThemedButton variant="outline" onClick={() => setLimit((value) => value + 20)}>Показать ещё {Math.min(20, hiddenCount)} из {hiddenCount}</ThemedButton>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState title="В этой хронике пока нет серверов" description="Проекты появятся здесь после добавления в каталог." action="Открыть каталог" actionTo={`/catalog?game=${game.id}`} />
              )}
            </section>
          </>
        )}

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5" style={{ borderColor: theme.colors.border, background: theme.colors.surface }}>
          <div>
            <ThemedEyebrow className="mb-1.5">Владельцам</ThemedEyebrow>
            <ThemedHeading size={17} as="h3">
              Ваш сервер {game.shortName}?
            </ThemedHeading>
            <p className="mt-1 text-[13px]" style={{ color: theme.colors.textMuted }}>
              Разместите проект бесплатно и подключите проверку онлайна.
            </p>
          </div>
          <ThemedButton to="/owners" icon={<Plus size={14} />}>
            Узнать больше
          </ThemedButton>
        </div>
      </Container>
    </div>
  )
}

function SectionHead({ eyebrow, title, action, right }: { eyebrow: React.ReactNode; title: string; action?: { label: string; to: string }; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <ThemedEyebrow className="mb-1.5">{eyebrow}</ThemedEyebrow>
        <ThemedHeading size={24}>{title}</ThemedHeading>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {right}
        {action && (
          <ThemedButton to={action.to} variant="ghost" size="sm" iconRight={<ArrowRight size={14} />}>
            {action.label}
          </ThemedButton>
        )}
      </div>
    </div>
  )
}
