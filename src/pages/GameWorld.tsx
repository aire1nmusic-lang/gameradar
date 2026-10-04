import { useMemo } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import NotFound from './NotFound'
import { WorldIcon } from '@/components/icons/WorldIcon'
import { resolveWorld } from '@/data/themes'
import { chronicleOfVersion } from '@/data/games'
import { useAsync } from '@/hooks/data'
import { discoveryServers } from '@/services/catalogService'
import { hasFreshOnline } from '@/services/discoveryRanking'
import { Container } from '@/components/layout/Container'
import { ThemeScope, ThemedButton, ThemedEyebrow, ThemedHeading, useGameTheme } from '@/theme'
import { lightWorldTheme } from '@/theme/lightWorld'
import { GameHero } from '@/components/game/GameHero'
import { ChronicleNav } from '@/components/game/ChronicleNav'
import { ServerRow, ServerRowSkeleton } from '@/components/server/ServerRow'
import { RankPanel, ShelfNote } from '@/components/world/Shelves'
import { ChronicleTiles } from '@/components/world/ChronicleTiles'
import { EmptyState } from '@/components/ui/feedback'
import { breadcrumbs, useSeo } from '@/lib/seo'
import { useAppearance } from '@/theme/appearance'

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
  const { colorMode } = useAppearance()
  const isLineage2 = world.game?.id === 'lineage2'
  const activeTheme = colorMode === 'light' ? lightWorldTheme(world.theme) : world.theme

  // unknown single-segment url — this route sits below every static route
  if (!world.game) return <NotFound />
  if (chronicleSlug && !world.chronicle) return <Navigate to={`/${world.game.slug}`} replace />

  const scopeClass = [fromPortal ? 'gs-world-enter' : '', 'relative', isLineage2 ? 'gs-mobile-world' : '', colorMode === 'light' ? 'gs-world-light' : ''].filter(Boolean).join(' ')
  return (
    <ThemeScope theme={activeTheme} as="div" className={scopeClass}>
      <WorldBody
        gameSlug={world.game.slug}
        chronicleSlug={world.chronicle?.slug}
        key={`${world.game.slug}-${world.chronicle?.slug ?? 'all'}`}
      />
    </ThemeScope>
  )
}

function WorldBody({ gameSlug, chronicleSlug }: { gameSlug: string; chronicleSlug?: string }) {
  const theme = useGameTheme()
  const { game, chronicle } = resolveWorld(gameSlug, chronicleSlug)
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
  const { data: servers = [], loading, error, reload } = useAsync(() => discoveryServers({gameId: game?.id, chronicleId: chronicle?.id}), [game?.id, chronicle?.id], true)

  const known = hasFreshOnline
  const openings = useMemo(
    () => servers.filter((server) => server.launch && Date.parse(server.launch.at) > Date.now()).sort((a, b) => Date.parse(a.launch!.at) - Date.parse(b.launch!.at)),
    [servers],
  )
  const rest = useMemo(() => {
    const open = new Set(openings.map((server) => server.slug))
    return servers.filter((server) => !open.has(server.slug))
  }, [servers, openings])
  const topOnline = useMemo(() => rest.filter(known).sort((a, b) => b.online.current - a.online.current), [rest])
  const topSupport = useMemo(
    () => servers.filter((server) => (server.support?.coins ?? 0) > 0)
      .sort((a, b) => (b.support?.coins ?? 0) - (a.support?.coins ?? 0) || b.votes - a.votes),
    [servers],
  )
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
  const playersOnline = servers.reduce((sum, server) => sum + (known(server) ? server.online.current : 0), 0)
  return (
    <div className="relative" style={{ background: theme.colors.bg, color: theme.colors.text }}>
      {/* No count until the list arrives: a slow or failed request must not read as "0 серверов". */}
      <GameHero
        game={game}
        chronicle={chronicle}
        serversCount={(loading || error) && servers.length === 0 ? undefined : servers.length}
        playersOnline={playersOnline}
        openings={openings.length}
      />

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
            <div className="mt-6 grid gap-5 lg:grid-cols-3 lg:gap-3">
              <RankPanel
                plainMobile
                title="Топ поддержка"
                to={`/rating?game=${game.id}&all=support`}
              >
                {topSupport.length > 0
                  ? topSupport.slice(0, 15).map((server, index) => <ServerRow key={server.slug} server={server} rank={index + 1} showGame={false} metric="support" compact className={index >= 5 ? 'gs-preview-overflow' : undefined} />)
                  : <ShelfNote title="Рейтинг пока формируется" text="Здесь появятся серверы, получившие поддержку за Coins." />}
              </RankPanel>

              <RankPanel
                plainMobile
                title="Скоро открытие"
                to={`/openings?game=${game.id}`}
              >
                {openings.length > 0
                  ? openings.slice(0, 15).map((server, index) => <ServerRow key={server.slug} server={server} showGame={false} compact className={index >= 5 ? 'gs-preview-overflow' : undefined} />)
                  : <ShelfNote title="Ближайших открытий нет" text="Как только проект объявит дату старта, он появится здесь." />}
              </RankPanel>

              <RankPanel
                plainMobile
                title="Топ онлайн"
                to={`/catalog?game=${game.id}&sort=online`}
              >
                {topOnline.length > 0
                  ? topOnline.slice(0, 15).map((server, index) => <ServerRow key={server.slug} server={server} rank={index + 1} showGame={false} compact className={index >= 5 ? 'gs-preview-overflow' : undefined} />)
                  : <ShelfNote title="Живого онлайна пока нет" text="Число игроков появится, когда мы получим свежие данные." />}
              </RankPanel>
            </div>

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
          <ThemedButton to="/owners" icon={<WorldIcon name="plus" size={14} />}>
            Узнать больше
          </ThemedButton>
        </div>
      </Container>
    </div>
  )
}
