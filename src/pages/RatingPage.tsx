import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Crown, Sparkles, Trophy, Zap } from 'lucide-react'
import { GAMES, getGame } from '@/data/games'
import { useRating } from '@/hooks/data'
import { themeForGame } from '@/data/themes'
import { formatNumber } from '@/lib/format'
import { Container } from '@/components/layout/Container'
import { ChipToggle, Segmented } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'
import { ThemeScope } from '@/theme'
import { BoostedStrip, RatingList, RatingPodium } from '@/components/rating/RatingBoard'
import { SidebarBanner } from '@/components/ads/AdSlots'

type View = 'organic' | 'combined'

/**
 * Platform-wide rating.
 *
 * Default view is the independent rating. The boost-aware view exists too,
 * but it is a deliberate, labelled switch — never the default.
 */
export default function RatingPage() {
  const [gameId, setGameId] = useState<string>('all')
  const [view, setView] = useState<View>('organic')

  const scope = gameId === 'all' ? undefined : gameId
  const { data: organic = [] } = useRating({ gameId: scope })
  const { data: combined = [] } = useRating({ gameId: scope, sponsored: true })
  const entries = view === 'organic' ? organic : combined

  const theme = useMemo(() => themeForGame(gameId === 'all' ? 'core' : gameId), [gameId])
  const game = gameId === 'all' ? undefined : getGame(gameId)

  const tiers = [
    { id: 'top1', label: 'TOP 1', icon: <Crown size={13} />, count: 1 },
    { id: 'top3', label: 'TOP 3', icon: <Sparkles size={13} />, count: 3 },
    { id: 'top10', label: 'TOP 10', icon: <Trophy size={13} />, count: 10 },
  ]

  return (
    <div className="pb-16">
      <Container className="pt-10 lg:pt-14">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
            <Trophy size={13} />
            Рейтинг серверов
          </div>
          <h1 className="text-[30px] leading-tight sm:text-[40px]">ТОП серверов GameRadar</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            Очки начисляются за проверенный онлайн, стабильность данных, оценки игроков и динамику. Бусты
            показываются отдельной величиной и никогда не смешиваются с заработанными очками.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'organic', label: 'Независимый рейтинг' },
              { value: 'combined', label: 'С учётом продвижения' },
            ]}
          />
          <span className="text-[12.5px] text-ink-400">
            {view === 'organic'
              ? 'Платные размещения не влияют на позиции'
              : 'Позиции пересчитаны с учётом купленных бустов'}
          </span>
        </div>

        {view === 'combined' && (
          <Notice tone="warn" className="mt-4" title="Это витрина, а не рейтинг">
            В этом режиме сервер может стоять выше за счёт оплаты. Именно так выглядят списки большинства
            анонсеров — GameRadar показывает такой порядок только по явному запросу.
          </Notice>
        )}

        {/* game filter */}
        <div className="mt-6 flex flex-wrap gap-2">
          <ChipToggle active={gameId === 'all'} onClick={() => setGameId('all')}>
            Все игры
          </ChipToggle>
          {GAMES.slice(0, 6).map((item) => (
            <ChipToggle
              key={item.id}
              active={gameId === item.id}
              accent={item.accent}
              onClick={() => setGameId(item.id)}
            >
              {item.shortName}
            </ChipToggle>
          ))}
        </div>

        {/* tier legend */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {tiers.map((tier) => {
            const top = entries.slice(0, tier.count)
            const paid = top.filter((entry) => entry.boosted).length
            return (
              <div key={tier.id} className="surface rounded-xl px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-mono text-[12px] tracking-[0.12em] text-ink-200 uppercase">
                    {tier.icon}
                    {tier.label}
                  </span>
                  <span className="num text-[12px] text-ink-500">{formatNumber(top.length)}</span>
                </div>
                <p className="mt-1.5 text-[12.5px] text-ink-400">
                  {view === 'organic'
                    ? 'Позиции заработаны данными'
                    : paid > 0
                      ? `${paid} из ${top.length} — с продвижением`
                      : 'Без платных мест'}
                </p>
              </div>
            )
          })}
        </div>

        <ThemeScope theme={theme} as="div" className="mt-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-8">
              {entries.length > 0 ? (
                <>
                  <RatingPodium entries={entries} />
                  <RatingList entries={entries} />
                  {view === 'organic' && <BoostedStrip entries={combined} limit={4} />}
                </>
              ) : (
                <Notice tone="info">В этой игре пока нет серверов с достаточными данными для рейтинга.</Notice>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <SidebarBanner gameId={game?.id} />

              <div className="surface rounded-xl p-5">
                <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink-50">
                  <Zap size={14} className="text-promo-300" fill="currentColor" />
                  Хотите выше?
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
                  Бусты поднимают карточку в витринах и рекламных блоках. Позиция в независимом рейтинге остаётся
                  за данными сервера.
                </p>
                <Link
                  to="/boost"
                  className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md border border-promo-400/35 bg-promo-500/12 text-[13.5px] text-promo-200 transition-colors hover:bg-promo-500/20"
                >
                  Открыть продвижение
                </Link>
              </div>

              {game && (
                <Link
                  to={`/${game.slug}`}
                  className="surface block rounded-xl p-5 transition-colors hover:border-white/14"
                >
                  <div className="text-[13.5px] font-medium text-ink-50">Мир {game.shortName}</div>
                  <p className="mt-1.5 text-[12.5px] text-ink-400">
                    Оформленная страница игры с рейтингом, открытиями и хрониками.
                  </p>
                </Link>
              )}
            </aside>
          </div>
        </ThemeScope>
      </Container>
    </div>
  )
}
