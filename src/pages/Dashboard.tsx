import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ExternalLink,
  Info,
  PenLine,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { OWNER_ALERTS, type OwnerMetric } from '@/data/dashboard'
import { promoProducts } from '@/services'
import { useAsync, useOwnerAnalytics } from '@/hooks/data'
import { getGame } from '@/data/games'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge, TrendChip } from '@/components/ui/Badge'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { Segmented } from '@/components/ui/controls'
import { Modal } from '@/components/ui/overlays'
import { Notice, Skeleton } from '@/components/ui/feedback'
import { StatusBadge, VerifiedLine } from '@/components/trust/status'
import { BarSeries } from '@/components/charts/AreaChart'
import { TrustPanel } from '@/components/profile/TrustPanel'

export default function Dashboard() {
  const [projectIndex, setProjectIndex] = useState(0)
  const [range, setRange] = useState<'7' | '30'>('30')
  const [promoOpen, setPromoOpen] = useState(false)

  const { data: projects = [], loading } = useOwnerAnalytics()
  const { data: promos = [] } = useAsync(() => promoProducts(), [])
  const project = projects[projectIndex]

  if (loading || !project) {
    return (
      <Container className="py-24">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64 rounded" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </Container>
    )
  }

  const { server } = project
  const game = getGame(server.gameId)
  const views = range === '7' ? project.views.slice(-7) : project.views

  return (
    <div className="pb-16">
      <Container className="pt-8 lg:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
              Кабинет владельца
            </div>
            <h1 className="text-[26px] leading-tight sm:text-[32px]">Ваши серверы</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" icon={<PenLine size={15} />}>
              Редактировать карточку
            </Button>
            <Button to={`/server/${server.slug}`} variant="secondary" icon={<ExternalLink size={15} />}>
              Открыть карточку
            </Button>
          </div>
        </div>

        {/* project switcher */}
        <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar">
          {projects.map((item, index) => (
            <button
              key={item.server.slug}
              onClick={() => setProjectIndex(index)}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
                index === projectIndex
                  ? 'border-white/18 bg-white/[0.06]'
                  : 'border-white/7 bg-white/[0.02] hover:border-white/14',
              )}
            >
              <ServerLogo name={item.server.name} hue={item.server.hue} size="xs" />
              <span className="text-left">
                <span className="block text-[13.5px] font-medium text-ink-50">{item.server.name}</span>
                <span className="block text-[11.5px] text-ink-400">{getGame(item.server.gameId).shortName}</span>
              </span>
            </button>
          ))}
        </div>

        {/* hero strip */}
        <div className="surface mt-4 rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <ServerLogo name={server.name} hue={server.hue} size="lg" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[20px]">{server.name}</h2>
                  <StatusBadge status={server.online.status} size="sm" />
                </div>
                <div className="mt-1.5 text-[13px] text-ink-400">
                  {game.name} · {server.version} · {server.region}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <span className="num text-[15px] font-medium text-ink-50">
                    {server.online.status === 'PENDING' ? '—' : formatNumber(server.online.current)}
                    <span className="text-[12.5px] text-ink-500"> / {formatNumber(server.online.max)}</span>
                  </span>
                  <VerifiedLine status={server.online.status} seconds={server.online.checkedAgoSec} />
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
                <Trophy size={15} className="text-warn-400" />
                <div>
                  <div className="num text-[15px] font-semibold text-ink-50">
                    #{project.rankPosition}{' '}
                    <span className="text-[12px] font-normal text-ink-400">в {game.shortName}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-500">
                    <TrendChip value={project.rankChange} />
                    за 30 дней
                  </div>
                </div>
              </div>
              <Button variant="promo" icon={<Sparkles size={15} />} onClick={() => setPromoOpen(true)}>
                Поднять в TOP
              </Button>
            </div>
          </div>
        </div>

        {/* metrics */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {project.metrics.map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <section className="surface rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[16px]">Просмотры карточки</h3>
                  <p className="mt-1 text-[12.5px] text-ink-400">
                    Сколько раз игроки открывали вашу карточку в каталоге и поиске
                  </p>
                </div>
                <Segmented
                  value={range}
                  onChange={setRange}
                  size="sm"
                  options={[
                    { value: '7', label: '7 дней' },
                    { value: '30', label: '30 дней' },
                  ]}
                />
              </div>

              <div className="mt-5">
                <BarSeries data={views} height={150} accent="var(--color-signal-400)" />
                <div className="mt-2 flex justify-between font-mono text-[10.5px] text-ink-500">
                  <span>{range === '7' ? '7 дней назад' : '30 дней назад'}</span>
                  <span>сегодня</span>
                </div>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <section className="surface rounded-xl p-5">
                <h3 className="text-[15px]">Откуда приходят игроки</h3>
                <div className="mt-4 space-y-3">
                  {project.sources.map((source) => (
                    <div key={source.label}>
                      <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                        <span className="text-ink-300">{source.label}</span>
                        <span className="num text-ink-100">{source.value}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
                        <div className="h-full rounded-full bg-ink-300/70" style={{ width: `${source.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="surface rounded-xl p-5">
                <h3 className="text-[15px]">География</h3>
                <div className="mt-4 space-y-2.5">
                  {project.countries.map((country) => (
                    <div key={country.label} className="flex items-center gap-3">
                      <span className="w-5 text-center">{country.flag}</span>
                      <span className="flex-1 text-[13px] text-ink-300">{country.label}</span>
                      <span className="num text-[13px] text-ink-100">{country.value}%</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="surface rounded-xl p-5">
              <h3 className="text-[15px]">Уведомления</h3>
              <div className="mt-4 space-y-3">
                {OWNER_ALERTS.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 rounded-lg border border-white/6 bg-white/[0.02] p-3.5"
                  >
                    <span
                      className={cn(
                        'mt-0.5 shrink-0',
                        alert.kind === 'ok'
                          ? 'text-signal-400'
                          : alert.kind === 'warn'
                            ? 'text-warn-400'
                            : 'text-ink-300',
                      )}
                    >
                      {alert.kind === 'ok' ? (
                        <CheckCircle2 size={15} />
                      ) : alert.kind === 'warn' ? (
                        <Bell size={15} />
                      ) : (
                        <TrendingUp size={15} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13.5px] font-medium text-ink-50">{alert.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-ink-500">{alert.at}</span>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{alert.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <TrustPanel online={server.online} />

            <div className="surface rounded-xl p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-medium text-ink-50">Продвижение</h3>
                <Badge tone="promo">не подключено</Badge>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-400">
                Платные форматы повышают видимость карточки. На независимый рейтинг и проверку онлайна они не влияют.
              </p>
              <div className="mt-4 space-y-2">
                {promos.slice(0, 3).map((product) => (
                  <button
                    key={product.id}
                    onClick={() => setPromoOpen(true)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/7 bg-white/[0.02] px-3.5 py-3 text-left transition-colors hover:border-promo-500/35"
                  >
                    <span>
                      <span className="block text-[13.5px] font-medium text-ink-50">{product.name}</span>
                      <span className="block text-[11.5px] text-ink-400">{product.tag}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px] text-promo-200">
                      {product.priceLabel.replace('от ', '')}
                      <ArrowUpRight size={13} />
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/7 bg-ink-900/60 p-5">
              <h3 className="text-[14px] font-medium text-ink-50">Как поднять позицию</h3>
              <ul className="mt-3 space-y-2.5">
                {[
                  'Держите Verified Online подключённым',
                  'Обновляйте описание и теги раз в месяц',
                  'Отвечайте на отзывы игроков',
                  'Анонсируйте вайпы и сезоны заранее',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12.5px] text-ink-300">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-ink-500" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/owners"
                className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-ink-400 hover:text-ink-100"
              >
                Подробнее о рейтинге <ArrowUpRight size={13} />
              </Link>
            </div>
          </aside>
        </div>

        <p className="mt-6 flex items-start gap-2 text-[12px] text-ink-500">
          <Info size={13} className="mt-0.5 shrink-0" />
          Прототип кабинета: показатели сгенерированы для демонстрации и не отражают реальную статистику.
        </p>
      </Container>

      <Modal
        open={promoOpen}
        onClose={() => setPromoOpen(false)}
        title="Продвижение карточки"
        description="Выберите формат — оплата появится на следующем этапе разработки"
        width="max-w-lg"
        footer={
          <Button variant="primary" full to="/boost">
            Открыть продвижение
          </Button>
        }
      >
        <div className="space-y-3">
          {promos.map((product) => (
            <div key={product.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-[15px] font-semibold text-ink-50">{product.name}</span>
                <span className="text-[12.5px] text-promo-200">{product.priceLabel}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink-400">{product.description}</p>
            </div>
          ))}
        </div>
        <Notice tone="info" className="mt-4">
          Полный расчёт позиции, пакеты бустов и рекламные форматы — на странице продвижения. Платёжные системы в
          прототипе не подключены.
        </Notice>
      </Modal>
    </div>
  )
}

function MetricCard({ metric }: { metric: OwnerMetric }) {
  return (
    <div className="surface interactive rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12.5px] text-ink-400">{metric.label}</span>
        <TrendChip value={metric.change} />
      </div>
      <div className="num mt-3 font-display text-[26px] leading-none font-semibold text-ink-50">
        {metric.format === 'percent' ? `${metric.value.toFixed(1).replace('.', ',')}%` : formatNumber(metric.value)}
      </div>
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-500">{metric.hint}</p>
    </div>
  )
}
