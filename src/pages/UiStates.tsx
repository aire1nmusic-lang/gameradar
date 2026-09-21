import { CloudOff, Heart, RefreshCw, SearchX } from 'lucide-react'
import { useServers } from '@/hooks/data'
import type { GameServer, OnlineStatus } from '@/models'
import { Container } from '@/components/layout/Container'
import { ServerCard, ServerCardSkeleton } from '@/components/server/ServerCard'
import { StatusBadge, STATUS_META, VerifiedLine } from '@/components/trust/status'
import { EmptyState, Notice, Skeleton } from '@/components/ui/feedback'
import { Button } from '@/components/ui/Button'

function withStatus(server: GameServer, status: OnlineStatus): GameServer {
  return { ...server, online: { ...server.online, status } }
}

const STATUSES: OnlineStatus[] = ['VERIFIED', 'OWNER_REPORTED', 'OFFLINE', 'ANOMALY', 'PENDING', 'CHECKING']

export default function UiStates() {
  const { data: servers = [] } = useServers({ limit: 500 })
  const bySlug = (slug: string) => servers.find((server) => server.slug === slug)
  const holysky = bySlug('holysky')

  const cards: Array<{ status: OnlineStatus; server: GameServer }> = holysky
    ? (
        [
          { status: 'VERIFIED', server: bySlug('holysky') },
          { status: 'LIVE', server: withStatus(bySlug('asterion') ?? holysky, 'LIVE') },
          { status: 'OWNER_REPORTED', server: bySlug('azure-realms') },
          { status: 'OFFLINE', server: bySlug('pixelforge') },
          { status: 'ANOMALY', server: bySlug('northgate') },
          { status: 'PENDING', server: bySlug('frostpeak') },
          { status: 'CHECKING', server: withStatus(holysky, 'CHECKING') },
        ] as Array<{ status: OnlineStatus; server?: GameServer }>
      ).filter((card): card is { status: OnlineStatus; server: GameServer } => Boolean(card.server))
    : []

  return (
    <div className="pb-16">
      <Container className="pt-10 lg:pt-14">
        <div className="max-w-2xl">
          <div className="mb-3 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
            Дизайн-система
          </div>
          <h1 className="text-[30px] leading-tight sm:text-[40px]">Состояния интерфейса</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            Как GameRadar показывает доверие к данным, загрузку, пустые результаты и сбои. Каждое состояние имеет своё
            визуальное решение и честную формулировку.
          </p>
        </div>

        {/* statuses */}
        <Section title="Статусы онлайна" description="Шесть состояний данных — от проверенных до аномальных.">
          <div className="surface rounded-xl p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STATUSES.map((status) => (
                <div key={status} className="rounded-lg border border-white/6 bg-white/[0.02] p-4">
                  <StatusBadge status={status} />
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-400">{STATUS_META[status].caption}</p>
                  <div className="mt-3 border-t border-white/6 pt-3">
                    <VerifiedLine status={status} seconds={42} source="Данные предоставлены сервером" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Карточка в каждом состоянии" description="Одна и та же структура — разный уровень доверия.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((item) => (
              <div key={item.status}>
                <div className="mb-2 font-mono text-[11px] text-ink-500">{item.status}</div>
                <ServerCard server={item.server} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Загрузка" description="Скелетоны повторяют структуру контента, чтобы не было скачков вёрстки.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ServerCardSkeleton />
            <ServerCardSkeleton />
            <ServerCardSkeleton />
          </div>
          <div className="surface mt-4 rounded-xl p-4">
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/5" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Сообщения и предупреждения" description="Формулировки говорят, что именно произошло с данными.">
          <div className="space-y-3">
            <Notice tone="signal" title="Онлайн подтверждён">
              Значение получено прямым запросом к серверу 42 секунды назад. Успешных проверок за сутки — 99,8%.
            </Notice>
            <Notice tone="info" title="Онлайн не подтверждён независимо">
              Число передано владельцем сервера. GameRadar не может его проверить — подключение Verified Online
              доступно владельцу бесплатно.
            </Notice>
            <Notice tone="warn" title="Данные устарели">
              Последняя успешная проверка была 14 минут назад. Показываем последнее известное значение.
              <span className="mt-2 block font-mono text-[11.5px] text-warn-400/80">last_success=14m ago</span>
            </Notice>
            <Notice
              tone="warn"
              title="Обнаружена аномалия данных"
              action={
                <Button variant="outline" size="sm">
                  Подробнее
                </Button>
              }
            >
              Онлайн вырос на 96% за 12 минут при неизменном числе уникальных IP. Сервер временно исключён из рейтинга.
            </Notice>
            <Notice
              tone="danger"
              title="Сервер не отвечает"
              action={
                <Button variant="outline" size="sm" icon={<RefreshCw size={13} />}>
                  Повторить
                </Button>
              }
            >
              GameRadar не получает ответ с 09:40. Проверки продолжаются каждые 60 секунд.
            </Notice>
          </div>
        </Section>

        <Section title="Пустые состояния" description="Всегда предлагают следующий шаг, а не просто сообщают о пустоте.">
          <div className="grid gap-4 lg:grid-cols-3">
            <EmptyState
              icon={<SearchX size={22} />}
              title="Ничего не найдено"
              description="Попробуйте убрать часть фильтров или изменить запрос."
              action="Сбросить фильтры"
              actionTo="/catalog"
            />
            <EmptyState
              icon={<Heart size={22} />}
              title="Избранное пусто"
              description="Сохраняйте серверы, чтобы следить за их онлайном и вайпами."
              action="Открыть каталог"
              actionTo="/catalog"
            />
            <EmptyState
              icon={<CloudOff size={22} />}
              title="Данные временно недоступны"
              description="Не удалось получить статистику онлайна. Мы уже перепроверяем источник."
              action="Обновить"
              actionTo="/states"
            />
          </div>
        </Section>
      </Container>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-12">
      <h2 className="text-[22px]">{title}</h2>
      <p className="mt-1.5 mb-5 max-w-2xl text-[13.5px] text-ink-300">{description}</p>
      {children}
    </section>
  )
}
