import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Crown, Info, Rocket, ShieldOff, Sparkles, Trophy, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { BOOST_PACKAGES, boostForecast, leaderboard, type BoostPackage } from '@/data/boost'
import { AD_PRODUCTS } from '@/data/ads'
import { OWNER_PROJECTS } from '@/data/dashboard'
import { getGame } from '@/data/games'
import { themeForGame } from '@/data/themes'
import { worldArt } from '@/data/themeMedia'
import { Container } from '@/components/layout/Container'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { ThemeScope, ThemedButton, useGameTheme } from '@/theme'
import { Button } from '@/components/ui/Button'
import { RangeSlider, Segmented } from '@/components/ui/controls'
import { Modal } from '@/components/ui/overlays'
import { Notice } from '@/components/ui/feedback'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { StatusBadge } from '@/components/trust/status'
import { TierBadge } from '@/components/boost/BoostBadge'
import { ScoreBar } from '@/components/rating/RatingBoard'

/**
 * /boost — the commercial engine.
 *
 * Shows exactly what a purchase does to a position and, just as explicitly,
 * what it never does: it cannot buy a Verified Online status or a place in
 * the independent rating.
 */
export default function Boost() {
  const projects = OWNER_PROJECTS
  const [slug, setSlug] = useState(projects[0].server.slug)
  const [pack, setPack] = useState<BoostPackage['id'] | 'custom'>('pro')
  const [custom, setCustom] = useState(250)
  const [checkout, setCheckout] = useState<BoostPackage | null>(null)

  const server = projects.find((project) => project.server.slug === slug)?.server ?? projects[0].server
  const game = getGame(server.gameId)
  const theme = useMemo(() => themeForGame(server.gameId), [server.gameId])

  const extra = pack === 'custom' ? custom : (BOOST_PACKAGES.find((item) => item.id === pack)?.boosts ?? 0)
  const forecast = useMemo(() => boostForecast(server.slug, extra, server.gameId), [server.slug, extra, server.gameId])
  const board = useMemo(() => leaderboard(server.gameId), [server.gameId])
  const ranked = forecast.currentRank > 0

  return (
    <ThemeScope theme={theme} as="div">
      <section className="relative overflow-hidden pt-10 pb-10 sm:pt-16 sm:pb-14">
        <div className="pointer-events-none absolute inset-x-0 -top-14 h-[560px]">
          <WorldArtSurface
            art={worldArt('stage', server.gameId)}
            scrim="stage"
            priority
            width={1600}
            sizes="100vw"
          />
        </div>
        <Container className="relative">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-promo-400/30 bg-promo-500/10 px-3 py-1.5 text-[12px] text-promo-200">
              <Zap size={12} fill="currentColor" />
              Продвижение серверов
            </div>
            <h1 className="text-[34px] leading-[1.08] sm:text-[46px]">Продвиньте свой сервер</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-300 sm:text-[17px]">
              Бусты поднимают карточку в списках и рекламных блоках GameRadar. Позиция в независимом рейтинге при
              этом не меняется — и это видно каждому игроку.
            </p>
          </div>
        </Container>
      </section>

      <Container className="pb-16">
        {/* ── calculator ─────────────────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="surface rounded-2xl p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px]">Прогноз позиции</h2>
                <p className="mt-1 text-[13px] text-ink-400">
                  Расчёт по текущим очкам серверов в игре «{game.shortName}»
                </p>
              </div>
              {projects.length > 1 && (
                <Segmented
                  value={slug}
                  onChange={setSlug}
                  size="sm"
                  options={projects.map((project) => ({ value: project.server.slug, label: project.server.name }))}
                />
              )}
            </div>

            <div
              className="flex flex-wrap items-center gap-4 rounded-xl border p-4"
              style={{ borderColor: 'var(--gt-border)', background: 'var(--gt-surface)' }}
            >
              <ServerLogo name={server.name} hue={server.hue} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="gt-display truncate text-[17px]">{server.name}</span>
                  <StatusBadge status={server.online.status} size="sm" />
                </div>
                <div className="mt-1 text-[12.5px] gt-faint">
                  {game.shortName} · {server.version} · {server.flag} {server.region}
                </div>
              </div>
              <Link
                to={`/server/${server.slug}`}
                className="inline-flex items-center gap-1 text-[12.5px] gt-accent hover:underline"
              >
                Карточка <ArrowUpRight size={13} />
              </Link>
            </div>

            {ranked ? (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Позиция сейчас" value={`#${forecast.currentRank}`} />
                  <Metric
                    label="После покупки"
                    value={`#${forecast.projectedRank}`}
                    accent={forecast.projectedRank < forecast.currentRank}
                  />
                  <Metric label="Обгоните серверов" value={formatNumber(forecast.overtakes)} />
                  <Metric label="Очков после" value={formatNumber(forecast.projectedTotal)} />
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] text-ink-300">Сколько бустов покупаем</span>
                    <span className="num font-mono text-[13px] gt-accent">+{formatNumber(extra)}</span>
                  </div>
                  <RangeSlider
                    label="Бусты"
                    min={0}
                    max={1500}
                    step={25}
                    value={extra}
                    onChange={(value) => {
                      setPack('custom')
                      setCustom(value)
                    }}
                    formatValue={(value) => `${formatNumber(value)} бустов`}
                  />
                </div>

                <div className="mt-6 space-y-2.5">
                  <TierGoal
                    label={`До позиции #${Math.max(1, forecast.currentRank - 1)}`}
                    need={forecast.toNext}
                    icon={<ArrowUpRight size={13} />}
                  />
                  <TierGoal label="До TOP-10" need={forecast.toTop10} icon={<Trophy size={13} />} />
                  <TierGoal label="До TOP-3" need={forecast.toTop3} icon={<Sparkles size={13} />} />
                  <TierGoal label="До TOP-1" need={forecast.toTop1} icon={<Crown size={13} />} />
                </div>
              </>
            ) : (
              <Notice tone="info" title="Сервер ещё не в рейтинге" className="mt-5">
                {server.name} открывается позже, поэтому очки пока не начисляются. Для таких проектов есть
                Launch Promotion — продвижение до старта с предрегистрациями.
              </Notice>
            )}
          </div>

          {/* ladder */}
          <div className="surface rounded-2xl p-5">
            <h3 className="text-[15px]">Позиции в игре «{game.shortName}»</h3>
            <p className="mt-1 mb-4 text-[12.5px] text-ink-400">
              Подсветка — ваш сервер после покупки {formatNumber(extra)} бустов
            </p>
            <Ladder board={board} slug={server.slug} projectedRank={forecast.projectedRank} extra={extra} />
          </div>
        </div>

        {/* ── packages ───────────────────────────────────────────────── */}
        <section className="mt-16">
          <div className="mb-6">
            <h2 className="text-[24px] sm:text-[28px]">Пакеты продвижения</h2>
            <p className="mt-2 max-w-2xl text-[14px] text-ink-300">
              Бусты не сгорают мгновенно: они расходуются, пока сервер держит позицию. Отключить продвижение можно
              в любой момент.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {BOOST_PACKAGES.map((item) => {
              const preview = boostForecast(server.slug, item.boosts, server.gameId)
              const active = pack === item.id
              return (
                <div
                  key={item.id}
                  className={cn(
                    'relative flex flex-col rounded-2xl border p-5 transition-all duration-200',
                    active
                      ? 'border-promo-400/45 bg-promo-900/25 shadow-[0_18px_50px_-24px_rgba(124,107,245,0.6)]'
                      : 'border-white/8 bg-white/[0.02] hover:border-white/16',
                  )}
                >
                  {item.popular && (
                    <span className="absolute -top-2.5 left-5 rounded-full border border-promo-400/40 bg-ink-950 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-promo-200 uppercase">
                      Популярный
                    </span>
                  )}

                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-[22px] tracking-tight">{item.name}</h3>
                    <span className="num font-mono text-[12px] text-ink-400">{item.perBoostLabel}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-400">{item.tagline}</p>

                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="num font-display text-[30px] leading-none">{item.priceLabel}</span>
                    <span className="num text-[13px] text-ink-400">/ {formatNumber(item.boosts)} бустов</span>
                  </div>

                  {ranked && (
                    <div className="mt-4 rounded-lg border border-white/7 bg-white/[0.03] px-3 py-2.5">
                      <div className="text-[11px] tracking-[0.1em] text-ink-500 uppercase">Прогноз позиции</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="num text-[15px] text-ink-400 line-through">#{forecast.currentRank}</span>
                        <ArrowUpRight size={14} className="text-signal-400" />
                        <span className="num text-[17px] font-semibold text-ink-50">#{preview.projectedRank}</span>
                        <TierBadge rank={preview.projectedRank} className="ml-auto" />
                      </div>
                    </div>
                  )}

                  <ul className="mt-5 space-y-2.5">
                    {item.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-[13px] text-ink-200">
                        <Check size={14} className="mt-0.5 shrink-0 text-signal-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 space-y-2">
                    <Button
                      variant={active ? 'primary' : 'secondary'}
                      full
                      onClick={() => {
                        setPack(item.id)
                        setCustom(item.boosts)
                      }}
                    >
                      {active ? 'Пакет выбран' : 'Выбрать пакет'}
                    </Button>
                    <Button variant="ghost" full onClick={() => setCheckout(item)}>
                      Перейти к оплате
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── ad inventory ───────────────────────────────────────────── */}
        <section className="mt-16">
          <div className="mb-6">
            <h2 className="text-[24px] sm:text-[28px]">Рекламные места</h2>
            <p className="mt-2 max-w-2xl text-[14px] text-ink-300">
              Все форматы помечаются как реклама. Мы не показываем платные карточки без метки и не смешиваем их с
              независимым рейтингом.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AD_PRODUCTS.map((product) => (
              <div key={product.id} className="surface flex flex-col rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-medium text-ink-50">{product.name}</h3>
                  <span className="font-mono text-[10.5px] text-ink-500">{product.size}</span>
                </div>
                <p className="mt-1 text-[12.5px] text-ink-400">{product.place}</p>
                <p className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-300">{product.description}</p>
                <div className="mt-4 border-t border-white/6 pt-3 text-[13px] font-medium gt-accent">
                  {product.priceLabel}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── what money cannot buy ──────────────────────────────────── */}
        <section className="mt-16">
          <div className="grid gap-4 rounded-2xl border border-signal-500/18 bg-signal-900/20 p-6 sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-signal-300 uppercase">
                <ShieldOff size={13} />
                Что не продаётся
              </div>
              <h2 className="text-[24px] leading-tight sm:text-[28px]">Доверие не входит в пакеты</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-300">
                Продвижение влияет только на видимость. Данные о сервере GameRadar собирает сам — и одинаково для
                всех, независимо от оплаты.
              </p>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                'Статус VERIFIED ONLINE — только по результатам проверки',
                'Позиция в независимом рейтинге',
                'Значения онлайна и история графика',
                'Отзывы и оценки игроков',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 rounded-lg border border-white/7 bg-ink-950/40 p-3.5">
                  <ShieldOff size={14} className="mt-0.5 shrink-0 text-signal-400" />
                  <span className="text-[13px] leading-relaxed text-ink-200">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="relative mt-10 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-xl border border-white/7 p-5">
          <WorldArtSurface
            art={worldArt('promo', server.gameId)}
            scrim="banner"
            width={1600}
            sizes="(min-width: 1280px) 1200px, 100vw"
          />
          <div className="relative flex items-start gap-3">
            <Rocket size={16} className="mt-0.5 shrink-0 gt-accent" />
            <div>
              <div className="text-[14px] font-medium text-ink-50">Открываете новый сервер?</div>
              <p className="mt-0.5 text-[13px] text-ink-400">
                Launch Promotion собирает предрегистрации и напоминает игрокам о старте.
              </p>
            </div>
          </div>
          <ThemedButton to="/owners" className="relative">
            Узнать про Launch Promotion
          </ThemedButton>
        </div>
      </Container>

      <Modal
        open={checkout !== null}
        onClose={() => setCheckout(null)}
        title={`Пакет ${checkout?.name ?? ''}`}
        description={checkout ? `${formatNumber(checkout.boosts)} бустов · ${checkout.priceLabel}` : undefined}
        footer={
          <Button variant="primary" full onClick={() => setCheckout(null)}>
            Понятно
          </Button>
        }
      >
        <Notice tone="info" title="Оплата не подключена">
          Это прототип интерфейса. Платёжные системы, списание бустов и счета появятся на следующем этапе — сейчас
          показана только продуктовая механика.
        </Notice>
        {checkout && (
          <ul className="mt-4 space-y-2">
            {checkout.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-[13px] text-ink-200">
                <Check size={14} className="mt-0.5 shrink-0 text-signal-400" />
                {feature}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </ThemeScope>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/7 bg-white/[0.025] px-4 py-3">
      <div className="text-[11px] tracking-[0.08em] text-ink-500 uppercase">{label}</div>
      <div className={cn('num mt-1.5 font-display text-[22px] leading-none', accent ? 'text-signal-300' : 'text-ink-50')}>
        {value}
      </div>
    </div>
  )
}

function TierGoal({ label, need, icon }: { label: string; need: number; icon: React.ReactNode }) {
  const reached = need === 0
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-4 py-3',
        reached ? 'border-signal-500/25 bg-signal-500/[0.07]' : 'border-white/7 bg-white/[0.02]',
      )}
    >
      <span className={cn('flex items-center gap-2 text-[13.5px]', reached ? 'text-signal-200' : 'text-ink-200')}>
        {icon}
        {label}
      </span>
      <span className="num font-mono text-[12.5px]">
        {reached ? (
          <span className="text-signal-300">уже достигнуто</span>
        ) : (
          <span className="text-ink-300">нужно ещё {formatNumber(need)} бустов</span>
        )}
      </span>
    </div>
  )
}

/** Compact ladder of nearby positions, with the projected slot highlighted. */
function Ladder({
  board,
  slug,
  projectedRank,
  extra,
}: {
  board: ReturnType<typeof leaderboard>
  slug: string
  projectedRank: number
  extra: number
}) {
  const theme = useGameTheme()
  const me = board.find((entry) => entry.server.slug === slug)
  const others = board.filter((entry) => entry.server.slug !== slug)

  const projected = { ...me!, total: (me?.total ?? 0) + extra, boosts: (me?.boosts ?? 0) + extra, rank: projectedRank }
  const list = me ? [...others] : others
  list.splice(Math.max(0, projectedRank - 1), 0, projected)

  const window = list.slice(0, Math.max(8, Math.min(list.length, projectedRank + 3)))

  return (
    <ol className="space-y-1.5">
      {window.map((entry, index) => {
        const isMe = entry.server.slug === slug
        return (
          <li
            key={`${entry.server.slug}-${index}`}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
              isMe ? 'border-promo-400/45 bg-promo-500/12' : 'border-white/6 bg-white/[0.02]',
            )}
          >
            <span
              className="num w-6 shrink-0 text-center font-mono text-[12px]"
              style={{ color: isMe ? 'var(--color-promo-200)' : theme.colors.textFaint }}
            >
              {index + 1}
            </span>
            <ServerLogo name={entry.server.name} hue={entry.server.hue} size="xs" />
            <div className="min-w-0 flex-1">
              <div className={cn('truncate text-[13px]', isMe ? 'font-medium text-promo-100' : 'text-ink-200')}>
                {entry.server.name}
                {isMe && <span className="ml-2 text-[11px] text-promo-300">ваш сервер</span>}
              </div>
              <ScoreBar entry={entry} className="mt-1.5" />
            </div>
          </li>
        )
      })}
      <li className="flex items-center gap-2 px-3 pt-2 text-[11.5px] text-ink-500">
        <Info size={12} />
        Расчёт по демонстрационным данным прототипа
      </li>
    </ol>
  )
}
