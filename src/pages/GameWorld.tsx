import { Navigate, useParams } from 'react-router-dom'
import NotFound from './NotFound'
import { ArrowRight, CalendarClock, Flame, Plus, Trophy, Zap } from 'lucide-react'
import { resolveWorld } from '@/data/themes'
import { useRating, useServers } from '@/hooks/data'
import { formatCountdown } from '@/lib/format'
import { Container } from '@/components/layout/Container'
import { ThemeScope, ThemedButton, ThemedDivider, ThemedEyebrow, ThemedHeading, useGameTheme } from '@/theme'
import { GameHero } from '@/components/game/GameHero'
import { ChronicleNav } from '@/components/game/ChronicleNav'
import { ThemedServerCard } from '@/components/server/ThemedServerCard'
import { BackgroundTakeover, FeaturedServerCard, SidebarBanner, TopBanner } from '@/components/ads/AdSlots'
import { BoostedStrip, RatingList, RatingPodium } from '@/components/rating/RatingBoard'
import { EmptyState } from '@/components/ui/feedback'

/**
 * A game world: /minecraft, /lineage-2, /lineage-2/interlude.
 * Same platform, same data, completely different visual identity.
 */
export default function GameWorld() {
  const { gameSlug, chronicleSlug } = useParams()
  const world = resolveWorld(gameSlug, chronicleSlug)

  // unknown single-segment url — this route sits below every static route
  if (!world.game) return <NotFound />
  if (chronicleSlug && !world.chronicle) return <Navigate to={`/${world.game.slug}`} replace />

  return (
    <ThemeScope theme={world.theme} as="div" className="relative">
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

  const { data: servers = [] } = useServers({ gameId: game?.id, chronicleId: chronicle?.id, limit: 200 }, true)
  const { data: entries = [] } = useRating({ gameId: game?.id, chronicleId: chronicle?.id, sponsored: true })
  const { data: organic = [] } = useRating({ gameId: game?.id, chronicleId: chronicle?.id })

  if (!game) return null

  const live = servers.filter((server) => server.online.status !== 'PENDING')
  const openings = servers.filter((server) => server.launch)
  const verifiedShare = live.length ? live.filter((s) => s.online.status === 'VERIFIED').length / live.length : 0
  const topOnline = [...live].sort((a, b) => b.online.current - a.online.current).slice(0, 6)

  return (
    <div className="relative" style={{ background: theme.colors.bg, color: theme.colors.text }}>
      <BackgroundTakeover gameId={game.id} />

      <GameHero
        game={game}
        chronicle={chronicle}
        serversCount={chronicle?.serversCount ?? game.serversCount}
        playersOnline={chronicle?.playersOnline ?? game.playersOnline}
        verifiedShare={verifiedShare || 0.82}
      />

      <Container className="relative pb-16">
        <div className="mb-8">
          <ChronicleNav game={game} chronicles={game.chronicles} />
        </div>

        <TopBanner gameId={game.id} className="mb-10" />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
          <div className="min-w-0 space-y-14">
            {/* live servers */}
            <section>
              <SectionHead
                eyebrow={
                  <>
                    <Flame size={12} /> Сейчас высокий онлайн
                  </>
                }
                title={chronicle ? `Серверы ${chronicle.label}` : `Серверы ${game.shortName}`}
                description="Онлайн получен GameScout напрямую. Карточки с пометкой REPORTED показывают данные владельца."
                action={{ label: 'Весь каталог', to: `/catalog?game=${game.id}` }}
              />

              {topOnline.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {topOnline.map((server) => (
                    <ThemedServerCard key={server.slug} server={server} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="В этой хронике пока нет активных серверов"
                  description="Проекты появятся здесь, как только пройдут проверку онлайна."
                  action="Открыть каталог"
                  actionTo={`/catalog?game=${game.id}`}
                />
              )}
            </section>

            <FeaturedServerCard gameId={game.id} />

            {/* openings */}
            {openings.length > 0 && (
              <section>
                <SectionHead
                  eyebrow={
                    <>
                      <CalendarClock size={12} /> Скоро открытие
                    </>
                  }
                  title="Новые миры этой игры"
                  description="Серверы, которые стартуют в ближайшие дни."
                  action={{ label: 'Все открытия', to: '/openings' }}
                />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {openings.map((server) => (
                    <div key={server.slug} className="relative">
                      <ThemedServerCard server={server} />
                      <span
                        className="pointer-events-none absolute top-2.5 left-1/2 z-[3] -translate-x-1/2 rounded-full border px-2.5 py-1 font-mono text-[10.5px] backdrop-blur-sm"
                        style={{
                          borderColor: theme.colors.borderStrong,
                          background: `color-mix(in oklab, ${theme.colors.bgDeep} 70%, transparent)`,
                          color: theme.colors.text,
                        }}
                      >
                        старт {formatCountdown(server.launch!.at)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* rating */}
            <section id="rating" className="scroll-mt-24">
              <SectionHead
                eyebrow={
                  <>
                    <Trophy size={12} /> Рейтинг
                  </>
                }
                title={chronicle ? `ТОП серверов ${chronicle.label}` : `ТОП серверов ${game.shortName}`}
                description="Независимый рейтинг: проверенный онлайн, отзывы и стабильность. Продвижение на него не влияет."
                action={{ label: 'Полный рейтинг', to: '/rating' }}
              />

              {organic.length > 0 ? (
                <div className="space-y-8">
                  <RatingPodium entries={organic} />
                  <RatingList entries={organic} />
                  <ThemedDivider />
                  <BoostedStrip entries={entries} />
                </div>
              ) : (
                <EmptyState title="Рейтинг пока не сформирован" description="Нужно минимум три сервера с проверенным онлайном." />
              )}
            </section>
          </div>

          {/* sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <SidebarBanner gameId={game.id} />

            <div
              className="rounded-xl border p-5"
              style={{ borderColor: theme.colors.border, background: theme.colors.surface }}
            >
              <ThemedEyebrow className="mb-3">Владельцам</ThemedEyebrow>
              <ThemedHeading size={18} as="h3">
                Ваш сервер {game.shortName}?
              </ThemedHeading>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: theme.colors.textMuted }}>
                Разместите проект бесплатно, подключите Verified Online и получайте переходы игроков.
              </p>
              <div className="mt-4 space-y-2">
                <ThemedButton to="/add-server" full icon={<Plus size={14} />}>
                  Добавить сервер
                </ThemedButton>
                <ThemedButton to="/boost" full variant="outline" icon={<Zap size={13} />}>
                  Продвинуть сервер
                </ThemedButton>
              </div>
            </div>

            <div
              className="rounded-xl border p-5"
              style={{ borderColor: theme.colors.border, background: theme.colors.surface }}
            >
              <ThemedEyebrow className="mb-3">Тема мира</ThemedEyebrow>
              <p className="text-[13px] leading-relaxed" style={{ color: theme.colors.textMuted }}>
                {theme.mood}
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                {[theme.colors.primary, theme.colors.secondary, theme.colors.accent].map((color) => (
                  <span key={color} className="h-5 w-5 rounded-md" style={{ background: color }} />
                ))}
                <span className="ml-2 font-mono text-[10.5px]" style={{ color: theme.colors.textFaint }}>
                  {theme.id}
                </span>
              </div>
            </div>
          </aside>
        </div>
      </Container>
    </div>
  )
}

function SectionHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: React.ReactNode
  title: string
  description?: string
  action?: { label: string; to: string }
}) {
  const theme = useGameTheme()
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <ThemedEyebrow className="mb-2.5">{eyebrow}</ThemedEyebrow>
        <ThemedHeading size={26}>{title}</ThemedHeading>
        {description && (
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed" style={{ color: theme.colors.textMuted }}>
            {description}
          </p>
        )}
      </div>
      {action && (
        <ThemedButton to={action.to} variant="ghost" size="sm" iconRight={<ArrowRight size={14} />}>
          {action.label}
        </ThemedButton>
      )}
    </div>
  )
}
