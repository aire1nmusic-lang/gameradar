import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import NotFound from './NotFound'
import { ArrowRight, CalendarClock, Flame, Plus, Trophy } from 'lucide-react'
import { resolveWorld } from '@/data/themes'
import { useRating, useServers } from '@/hooks/data'
import type { GameServer } from '@/models'
import { Container } from '@/components/layout/Container'
import { ThemeScope, ThemedButton, ThemedEyebrow, ThemedHeading, useGameTheme } from '@/theme'
import { GameHero } from '@/components/game/GameHero'
import { ChronicleNav } from '@/components/game/ChronicleNav'
import { ServerList } from '@/components/server/ServerRow'
import { LaunchRow } from '@/components/server/LaunchRow'
import { RatingPodium } from '@/components/rating/RatingBoard'
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

  // unknown single-segment url — this route sits below every static route
  if (!world.game) return <NotFound />
  if (chronicleSlug && !world.chronicle) return <Navigate to={`/${world.game.slug}`} replace />

  return (
    <ThemeScope theme={world.theme} as="div" className="relative">
      <WorldBody gameSlug={world.game.slug} chronicleSlug={world.chronicle?.slug} key={`${world.game.slug}-${world.chronicle?.slug ?? 'all'}`} />
    </ThemeScope>
  )
}

type Sort = 'online' | 'new' | 'name'

function WorldBody({ gameSlug, chronicleSlug }: { gameSlug: string; chronicleSlug?: string }) {
  const theme = useGameTheme()
  const { game, chronicle } = resolveWorld(gameSlug, chronicleSlug)
  const [sort, setSort] = useState<Sort>('online')

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
  const { data: servers = [], loading } = useServers({ gameId: game?.id, chronicleId: chronicle?.id, limit: 200 }, true)
  const { data: organic = [] } = useRating({ gameId: game?.id, chronicleId: chronicle?.id })

  const openings = useMemo(() => servers.filter((server) => server.launch && Date.parse(server.launch.at) > Date.now()), [servers])
  const listed = useMemo(() => {
    const open = new Set(openings.map((server) => server.slug))
    const rest = servers.filter((server) => !open.has(server.slug))
    const known = (server: GameServer) => server.online.playersKnown !== false && server.online.status !== 'UNKNOWN'
    const byOnline = (a: GameServer, b: GameServer) => Number(known(b)) - Number(known(a)) || b.online.current - a.online.current
    if (sort === 'name') return [...rest].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    if (sort === 'new') return [...rest].sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
    return [...rest].sort(byOnline)
  }, [servers, openings, sort])

  if (!game) return null
  const playersOnline = servers.reduce((sum, server) => sum + (server.online.freshness === 'fresh' ? server.online.current : 0), 0)

  return (
    <div className="relative" style={{ background: theme.colors.bg, color: theme.colors.text }}>
      <GameHero game={game} chronicle={chronicle} serversCount={servers.length} playersOnline={playersOnline} openings={openings.length} />

      <Container className="relative pb-16">
        {/* chronicles + sort stay reachable while the list scrolls */}
        <div className="sticky top-[60px] z-30 -mx-5 px-5 py-2.5 sm:mx-0 sm:px-0" style={{ background: `color-mix(in oklab, ${theme.colors.bg} 92%, transparent)`, backdropFilter: 'blur(12px)' }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <ChronicleNav game={game} chronicles={game.chronicles} />
            </div>
            <Segmented
              value={sort}
              onChange={setSort}
              size="sm"
              className="shrink-0 self-start"
              options={[
                { value: 'online', label: 'Онлайн' },
                { value: 'new', label: 'Новые' },
                { value: 'name', label: 'А–Я' },
              ]}
            />
          </div>
        </div>

        <section className="mt-6">
          <SectionHead
            eyebrow={
              <>
                <Flame size={12} /> Серверы
              </>
            }
            title={chronicle ? `Серверы ${chronicle.label}` : `Серверы ${game.shortName}`}
            action={{ label: 'Фильтры в каталоге', to: `/catalog?game=${game.id}` }}
          />
          {listed.length > 0 ? (
            <ServerList servers={listed} ranked={sort === 'online'} showGame={false} />
          ) : loading ? null : (
            <EmptyState title="В этой хронике пока нет серверов" description="Проекты появятся здесь после добавления в каталог." action="Открыть каталог" actionTo={`/catalog?game=${game.id}`} />
          )}
        </section>

        {openings.length > 0 && (
          <section className="mt-12">
            <SectionHead
              eyebrow={
                <>
                  <CalendarClock size={12} /> Скоро открытие
                </>
              }
              title="Стартуют в ближайшие дни"
              action={{ label: 'Все открытия', to: '/openings' }}
            />
            <div className="space-y-1.5">
              {openings.map((server) => (
                <LaunchRow key={server.slug} server={server} showGame={false} />
              ))}
            </div>
          </section>
        )}

        {organic.length >= 3 && (
          <section id="rating" className="mt-12 scroll-mt-24">
            <SectionHead
              eyebrow={
                <>
                  <Trophy size={12} /> Рейтинг
                </>
              }
              title={chronicle ? `ТОП серверов ${chronicle.label}` : `ТОП серверов ${game.shortName}`}
              action={{ label: 'Полный рейтинг', to: '/rating' }}
            />
            <RatingPodium entries={organic} />
          </section>
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
          <ThemedButton to="/add-server" icon={<Plus size={14} />}>
            Добавить сервер
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
      <div className="flex items-center gap-2">
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
