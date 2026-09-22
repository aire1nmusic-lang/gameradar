import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BellRing,
  CalendarClock,
  ChevronRight,
  Globe,
  Heart,
  MessageSquare,
  Play,
  Send,
  Share2,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { cn, hashSeed } from '@/lib/utils'
import {
  formatAge,
  formatCountdown,
  formatDate,
  formatLaunch,
  formatNumber,
  formatRating,
  formatRelativeDays,
  plural,
} from '@/lib/format'
import { chronicleOfVersion, getGame } from '@/data/games'
import { themeForGame } from '@/data/themes'
import { useServer, useSimilarServers } from '@/hooks/data'
import type { ChartRange, GameServer } from '@/models'
import { useFavorites } from '@/hooks/useFavorites'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge, PromoLabel, Tag, TrendChip } from '@/components/ui/Badge'
import { Rating } from '@/components/ui/Rating'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { EmptyState, Notice, Skeleton } from '@/components/ui/feedback'
import { Segmented } from '@/components/ui/controls'
import { Modal } from '@/components/ui/overlays'
import { StatusBadge, VerifiedLine } from '@/components/trust/status'
import { AreaChart } from '@/components/charts/AreaChart'
import { TrustPanel } from '@/components/profile/TrustPanel'
import { ServerMedia } from '@/components/profile/ServerMedia'
import { ProceduralShot } from '@/components/art/ProceduralShot'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { serverArt } from '@/data/themeMedia'
import {
  ThemeHorizon,
  ThemeParticles,
  ThemePattern,
  ThemeScope,
  ThemedButton,
} from '@/theme'
import { ServerCard } from '@/components/server/ServerCard'

export default function ServerProfile() {
  const { slug } = useParams()
  const { data: server, loading } = useServer(slug)

  if (loading) {
    return (
      <div className="pb-20">
        <Skeleton className="h-[220px] w-full rounded-none sm:h-[320px]" />
        <Container className="relative -mt-12">
          <div className="flex items-end gap-4">
            <Skeleton className="h-[88px] w-[88px] rounded-xl" />
            <div className="space-y-3 pb-2">
              <Skeleton className="h-7 w-52 rounded" />
              <Skeleton className="h-4 w-72 rounded" />
            </div>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </Container>
      </div>
    )
  }

  if (!server) {
    return (
      <Container className="py-24">
        <EmptyState
          title="Сервер не найден"
          description="Возможно, карточка была удалена владельцем или ссылка устарела."
          action="Открыть каталог"
          actionTo="/catalog"
        />
      </Container>
    )
  }

  return <Profile server={server} />
}

function Profile({ server }: { server: GameServer }) {
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const theme = themeForGame(server.gameId, chronicle?.themeId)
  const cover = serverArt(server)
  const { has, toggle } = useFavorites()
  const favorite = has(server.slug)
  const [reviewOpen, setReviewOpen] = useState(false)
  const { data: similar = [] } = useSimilarServers(server.slug, 3)

  return (
    <ThemeScope theme={theme} as="div" className="pb-28 lg:pb-16" >
      {/* hero: art of the server's world */}
      <div className="relative h-[220px] overflow-hidden sm:h-[320px]">
        <WorldArtSurface
          art={cover}
          fallback={
            <>
              <ProceduralShot seed={hashSeed(server.slug)} kind="landscape" />
              <div className="gt-hero absolute inset-0 opacity-65" />
              <ThemeHorizon />
            </>
          }
          scrim="hero"
          priority
          width={1600}
          sizes="100vw"
        />
        <ThemePattern opacity={cover ? 0.05 : 0.12} />
        <ThemeParticles />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(to top, ${theme.colors.bgDeep} 2%, transparent 68%)` }}
        />
        <Container className="relative flex h-full items-start pt-4">
          <nav className="flex items-center gap-1.5 text-[12.5px] text-white/60">
            <Link to="/" className="transition-colors hover:text-white">
              Главная
            </Link>
            <ChevronRight size={12} />
            <Link to={`/catalog?game=${game.id}`} className="transition-colors hover:text-white">
              {game.shortName}
            </Link>
            <ChevronRight size={12} />
            <span className="text-white/85">{server.name}</span>
          </nav>
        </Container>
      </div>

      <Container className="relative -mt-12 sm:-mt-14">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
            <ServerLogo
              name={server.name}
              hue={server.hue}
              size="xl"
              className="shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] ring-4 ring-ink-950"
            />
            <div className="pb-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={server.online.status} />
                {server.promo && <PromoLabel kind={server.promo} />}
              </div>
              <h1 className="text-[26px] leading-tight sm:text-[34px]">{server.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: game.accent }} />
                  {game.name} · {chronicle?.label ?? server.version}
                </span>
                <span className="text-ink-600">•</span>
                <span>
                  {server.flag} {server.country} · {server.region}
                </span>
                <span className="text-ink-600">•</span>
                <Rating value={server.rating} count={server.reviewsCount} size="sm" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-1">
            <button
              onClick={() => toggle(server.slug)}
              aria-label="В избранное"
              className={cn(
                'grid h-11 w-11 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-ink-300 transition-colors hover:border-white/20 hover:text-ink-50',
                favorite && 'border-danger-500/35 text-danger-400',
              )}
            >
              <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
            </button>
            <button
              aria-label="Поделиться"
              className="grid h-11 w-11 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-ink-300 transition-colors hover:border-white/20 hover:text-ink-50"
            >
              <Share2 size={16} />
            </button>
            <span className="hidden lg:block">
              {server.online.status === 'PENDING' ? (
                <ThemedButton size="lg" icon={<BellRing size={16} />}>
                  Напомнить об открытии
                </ThemedButton>
              ) : (
                <ThemedButton size="lg" icon={<Play size={16} fill="currentColor" />}>
                  Играть на сервере
                </ThemedButton>
              )}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-1.5">
          {server.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px] lg:gap-8">
          <div className="min-w-0 space-y-6">
            <OnlineSection server={server} />
            <ServerMedia server={server} />
            <InfoSection server={server} />
            <HistorySection server={server} />
            <ReviewsSection server={server} onWrite={() => setReviewOpen(true)} />
          </div>

          <aside className="space-y-4">
            <div className="lg:sticky lg:top-24 lg:space-y-4">
              <TrustPanel online={server.online} />
              <LinksCard server={server} />
              <OwnerCard />
            </div>
          </aside>
        </div>

        {similar.length > 0 && (
          <section className="mt-14">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <h2 className="text-[22px]">Похожие серверы</h2>
                <p className="mt-1.5 text-[13.5px] text-ink-300">
                  Те же игра и режимы — сравните онлайн и рейтинг перед выбором.
                </p>
              </div>
              <Link
                to={`/catalog?game=${server.gameId}`}
                className="hidden text-[13px] text-ink-300 hover:text-ink-50 sm:block"
              >
                Все серверы {game.shortName}
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((item) => (
                <ServerCard key={item.slug} server={item} />
              ))}
            </div>
          </section>
        )}
      </Container>

      {/* mobile sticky CTA */}
      <div className="safe-bottom fixed inset-x-0 bottom-[58px] z-40 glass border-t border-white/8 px-4 py-2.5 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="num text-[15px] font-semibold text-ink-50">
              {server.online.status === 'PENDING' ? formatCountdown(server.launch!.at) : formatNumber(server.online.current)}
              {server.online.status !== 'PENDING' && (
                <span className="text-[12px] font-normal text-ink-500"> / {formatNumber(server.online.max)}</span>
              )}
            </div>
            <VerifiedLine status={server.online.status} seconds={server.online.checkedAgoSec} size="xs" />
          </div>
          {server.online.status === 'PENDING' ? (
            <Button variant="primary" icon={<BellRing size={15} />}>
              Напомнить
            </Button>
          ) : (
            <Button variant="primary" icon={<Play size={15} />}>
              Играть
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Оставить отзыв"
        description={`${server.name} · ${game.shortName}`}
        footer={
          <Button variant="primary" full onClick={() => setReviewOpen(false)}>
            Отправить отзыв
          </Button>
        }
      >
        <Notice tone="info">
          Прототип: отзывы не сохраняются. В продукте отзыв может оставить игрок, который провёл на сервере не менее
          30 минут за последние 30 дней.
        </Notice>
      </Modal>
    </ThemeScope>
  )
}

function OnlineSection({ server }: { server: GameServer }) {
  const [range, setRange] = useState<ChartRange>('24h')
  const { status, current, max, change24h, peak24h, avg7d, peak30d } = server.online
  const data = server.history[range]

  if (status === 'PENDING' && server.launch) {
    return (
      <section className="surface rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[18px]">Открытие сервера</h2>
          <Badge tone="promo" icon={<CalendarClock size={12} />}>
            {server.launch.type}
          </Badge>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <StatTile label="До открытия" value={formatCountdown(server.launch.at)} accent />
          <StatTile label="Дата и время" value={formatLaunch(server.launch.at)} />
          <StatTile
            label="Предрегистрации"
            value={formatNumber(server.launch.preRegistrations)}
            extra={<TrendChip value={server.launch.interestChange} />}
          />
        </div>

        <Notice tone="info" className="mt-5">
          Проверка онлайна начнётся автоматически в момент запуска. До этого GameScout не показывает никаких цифр
          онлайна — даже если владелец их заявляет.
        </Notice>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" icon={<BellRing size={15} />}>
            Напомнить об открытии
          </Button>
          <Button variant="outline" href={`https://${server.links.discord}`} icon={<MessageSquare size={15} />}>
            Discord проекта
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="surface rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[18px]">Онлайн</h2>
          <div className="mt-3 flex items-end gap-3">
            <span
              className={cn(
                'num font-display text-[40px] leading-none font-semibold tracking-tight sm:text-[48px]',
                status === 'OFFLINE' ? 'text-ink-500' : 'text-ink-50',
              )}
            >
              {formatNumber(current)}
            </span>
            <span className="pb-1.5 text-[14px] text-ink-400">
              {status === 'OFFLINE' ? 'сервер не отвечает' : `игроков сейчас · из ${formatNumber(max)}`}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <VerifiedLine status={status} seconds={server.online.checkedAgoSec} source={server.online.source} />
            {status !== 'OFFLINE' && <TrendChip value={change24h} />}
          </div>
        </div>

        <Segmented
          value={range}
          onChange={setRange}
          size="sm"
          options={[
            { value: '24h', label: '24 часа' },
            { value: '7d', label: '7 дней' },
            { value: '30d', label: '30 дней' },
          ]}
        />
      </div>

      {status === 'OFFLINE' && server.online.note && (
        <Notice tone="danger" title="Сервер не отвечает" className="mt-5">
          {server.online.note}
        </Notice>
      )}
      {status === 'ANOMALY' && server.online.note && (
        <Notice tone="warn" title="Обнаружена аномалия данных" className="mt-5">
          {server.online.note} До завершения перепроверки сервер не участвует в рейтинге и блоках роста.
        </Notice>
      )}
      {status === 'OWNER_REPORTED' && (
        <Notice tone="info" title="Онлайн не подтверждён независимо" className="mt-5">
          Число передано владельцем сервера. GameScout не может его проверить — подключение Verified Online доступно
          владельцу бесплатно.
        </Notice>
      )}

      <div className="mt-6">
        <AreaChart
          data={data}
          range={range}
          accent={
            status === 'VERIFIED'
              ? 'var(--color-signal-400)'
              : status === 'OFFLINE'
                ? 'var(--color-danger-400)'
                : status === 'ANOMALY'
                  ? 'var(--color-warn-400)'
                  : 'var(--color-ink-300)'
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Сейчас" value={formatNumber(current)} accent={status === 'VERIFIED'} />
        <StatTile label="Пик за 24 часа" value={formatNumber(peak24h)} />
        <StatTile label="Среднее за 7 дней" value={formatNumber(avg7d)} />
        <StatTile label="Пик за 30 дней" value={formatNumber(peak30d)} />
      </div>
    </section>
  )
}

function StatTile({
  label,
  value,
  accent,
  extra,
}: {
  label: string
  value: string
  accent?: boolean
  extra?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/6 bg-white/[0.025] px-3.5 py-3">
      <div className="text-[11px] tracking-[0.06em] text-ink-500 uppercase">{label}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={cn('num text-[17px] font-semibold', accent ? 'text-signal-300' : 'text-ink-50')}>{value}</span>
        {extra}
      </div>
    </div>
  )
}

function InfoSection({ server }: { server: GameServer }) {
  const game = getGame(server.gameId)
  const specs: Array<[string, string]> = [
    ['Игра', game.name],
    ['Версия / хроники', server.version],
    ['Режимы', server.modes.join(' · ')],
    ['Регион', `${server.region} · ${server.country}`],
    ['Языки', server.languages.join(', ')],
  ]
  if (server.rates) specs.push(['Рейты', server.rates])
  if (server.nextWipeAt) specs.push(['Следующий вайп', formatDate(server.nextWipeAt)])
  specs.push(['Открыт', `${formatDate(server.openedAt)} · ${formatAge(server.openedAt)}`])

  return (
    <section className="surface rounded-xl p-5 sm:p-6">
      <h2 className="text-[18px]">Информация</h2>
      <p className="mt-3 text-[14.5px] leading-relaxed text-ink-200">{server.description}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {server.highlights.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/7 bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] text-ink-200"
          >
            <ShieldCheck size={12} className="text-signal-400" />
            {item}
          </span>
        ))}
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-0 sm:grid-cols-2">
        {specs.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 border-b border-white/5 py-2.5">
            <dt className="shrink-0 text-[13px] text-ink-400">{label}</dt>
            <dd className="text-right text-[13px] text-ink-100">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function HistorySection({ server }: { server: GameServer }) {
  return (
    <section className="surface rounded-xl p-5 sm:p-6">
      <h2 className="text-[18px]">История проекта</h2>
      <div className="mt-5 space-y-0">
        {server.events.map((event, index) => (
          <div key={`${event.label}-${index}`} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  event.kind === 'verify'
                    ? 'bg-signal-400'
                    : event.kind === 'wipe'
                      ? 'bg-warn-400'
                      : event.kind === 'season'
                        ? 'bg-promo-400'
                        : 'bg-ink-500',
                )}
              />
              {index < server.events.length - 1 && <span className="w-px flex-1 bg-white/8" />}
            </div>
            <div className="flex flex-1 items-baseline justify-between gap-4 pb-5">
              <span className="text-[13.5px] text-ink-100">{event.label}</span>
              <span className="shrink-0 text-right font-mono text-[12px] text-ink-400">
                {formatDate(event.date)}
                {formatRelativeDays(event.date) !== formatDate(event.date) && (
                  <span className="ml-2 text-ink-600">{formatRelativeDays(event.date)}</span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ReviewsSection({ server, onWrite }: { server: GameServer; onWrite: () => void }) {
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: server.reviews.filter((review) => review.rating === star).length,
  }))
  const total = Math.max(1, server.reviews.length)

  return (
    <section className="surface rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px]">Отзывы игроков</h2>
        <Button variant="secondary" size="sm" onClick={onWrite}>
          Написать отзыв
        </Button>
      </div>

      {server.reviews.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-white/10 px-5 py-10 text-center">
          <p className="text-[14px] text-ink-200">Отзывов пока нет</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-ink-400">
            Сервер ещё не открылся. Первые отзывы появятся после старта — оставить их смогут только игроки, которые
            действительно заходили на сервер.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-6 rounded-lg border border-white/6 bg-white/[0.02] p-5 sm:flex-row sm:items-center">
            <div className="text-center sm:w-36 sm:shrink-0">
              <div className="num font-display text-[40px] leading-none font-semibold text-ink-50">
                {formatRating(server.rating)}
              </div>
              <div className="mt-2 flex justify-center">
                <Rating value={server.rating} showCount={false} />
              </div>
              <div className="mt-1.5 text-[12px] text-ink-400">
                {formatNumber(server.reviewsCount)} {plural(server.reviewsCount, ['отзыв', 'отзыва', 'отзывов'])}
              </div>
            </div>

            <div className="flex-1 space-y-1.5">
              {distribution.map((item) => (
                <div key={item.star} className="flex items-center gap-3">
                  <span className="num w-3 text-[12px] text-ink-400">{item.star}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/6">
                    <div
                      className="h-full rounded-full bg-warn-400/70"
                      style={{ width: `${(item.count / total) * 100}%` }}
                    />
                  </div>
                  <span className="num w-6 text-right text-[12px] text-ink-500">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {server.reviews.map((review) => (
              <article key={review.id} className="rounded-lg border border-white/6 bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-medium text-white/90"
                      style={{ background: `linear-gradient(140deg, hsl(${review.hue} 55% 38%), hsl(${review.hue} 45% 22%))` }}
                    >
                      {review.author.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium text-ink-50">{review.author}</span>
                        {review.verifiedPlayer && (
                          <span
                            title="Игрок подтверждён по игровой сессии"
                            className="flex items-center gap-1 rounded-full bg-signal-500/10 px-1.5 py-0.5 text-[10px] text-signal-300"
                          >
                            <ShieldCheck size={9} />
                            играл на сервере
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-500">
                        <Rating value={review.rating} showCount={false} size="sm" />
                        <span>·</span>
                        <span>{review.playtime}</span>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-ink-500">{formatRelativeDays(review.date)}</span>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-ink-200">{review.text}</p>
                <button className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-ink-500 transition-colors hover:text-ink-200">
                  <Users size={12} />
                  Полезно · {review.helpful}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function LinksCard({ server }: { server: GameServer }) {
  return (
    <div className="surface rounded-xl p-5">
      <h3 className="mb-3.5 text-[14px] font-medium text-ink-50">Ссылки проекта</h3>
      <div className="space-y-2">
        <LinkRow icon={<Globe size={15} />} label={server.links.site} />
        <LinkRow icon={<MessageSquare size={15} />} label={server.links.discord} />
        {server.links.telegram && <LinkRow icon={<Send size={15} />} label={server.links.telegram} />}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3.5 text-[12.5px] text-ink-400">
        <span>В избранном у игроков</span>
        <span className="num text-ink-100">{formatNumber(server.favorites)}</span>
      </div>
    </div>
  )
}

function LinkRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <a
      href={`https://${label}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 rounded-md border border-white/7 bg-white/[0.02] px-3 py-2.5 text-[13px] text-ink-200 transition-colors hover:border-white/16 hover:text-ink-50"
    >
      <span className="text-ink-400">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight size={14} className="text-ink-600" />
    </a>
  )
}

function OwnerCard() {
  return (
    <div className="rounded-xl border border-white/7 bg-ink-900/60 p-5">
      <h3 className="text-[14px] font-medium text-ink-50">Это ваш сервер?</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        Подтвердите владение, чтобы редактировать карточку, подключить Verified Online и видеть статистику переходов.
      </p>
      <Button to="/owners" variant="outline" full className="mt-4">
        Подтвердить владение
      </Button>
    </div>
  )
}
