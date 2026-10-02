import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileCode2,
  Globe2,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  Radar,
  Server,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { promoProducts } from '@/services'
import { useAsync } from '@/hooks/data'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/trust/status'
import { useSeo } from '@/lib/seo'
import { useAuth } from '@/hooks/useAuth'
import { CoreOwners } from '@/components/owners/CoreOwners'

const BENEFITS = [
  {
    icon: <Users size={17} />,
    title: 'Игроки находят проект',
    body: 'Карточка попадает в каталог, поиск, подборки по играм и режимам — без платы за размещение.',
  },
  {
    icon: <ArrowRight size={17} />,
    title: 'Реальный трафик',
    body: 'Переходы на сайт, Discord и прямое подключение к серверу. Каждый источник считается отдельно.',
  },
  {
    icon: <BarChart3 size={17} />,
    title: 'Статистика карточки',
    body: 'Просмотры, переходы, CTR, добавления в избранное и позиция в каталоге по вашей игре.',
  },
  {
    icon: <Radar size={17} />,
    title: 'Verified Online',
    body: 'Независимая проверка онлайна. Игроки видят, что ваши цифры подтверждены, а не заявлены.',
  },
  {
    icon: <LineChart size={17} />,
    title: 'История онлайна',
    body: 'Графики за 24 часа, 7 и 30 дней. Видно эффект от обновлений, вайпов и рекламных кампаний.',
  },
  {
    icon: <Star size={17} />,
    title: 'Отзывы игроков',
    body: 'Оценки от тех, кто действительно играл. Возможность отвечать на отзывы от лица проекта.',
  },
]

const VERIFY_METHODS = [
  {
    icon: <Server size={16} />,
    title: 'Прямой игровой протокол',
    body: 'GameScout сам опрашивает сервер по адресу и порту. Ничего устанавливать не нужно.',
    games: 'Lineage 2, Minecraft, GTA RP',
  },
  {
    icon: <Globe2 size={16} />,
    title: 'Официальный API / server browser',
    body: 'Для игр с публичным списком серверов данные берутся из первоисточника платформы.',
    games: 'FiveM, RageMP, alt:V',
  },
  {
    icon: <FileCode2 size={16} />,
    title: 'GameScout Agent',
    body: 'Небольшой агент на вашем сервере — для закрытых лаунчеров и нестандартных сборок.',
    games: 'Lineage 2 и кастомные сборки',
  },
]

const OWNERSHIP_STEPS = [
  { title: 'DNS TXT-запись', body: 'Добавьте запись gamescout-verify=<код> в DNS вашего домена.' },
  { title: 'Файл на сайте', body: 'Загрузите файл gamescout.txt в корень сайта проекта.' },
  { title: 'Discord-сервер', body: 'Подтвердите роль администратора на официальном Discord проекта.' },
]

const FAQ = [
  {
    q: 'Сколько стоит размещение?',
    a: 'Размещение карточки, статистика и Verified Online бесплатны и останутся бесплатными. Платными будут только рекламные форматы: TOP, VIP, Featured, баннеры и продвижение перед открытием.',
  },
  {
    q: 'Что будет, если не подключать Verified Online?',
    a: 'Карточка останется в каталоге, но онлайн будет помечен как REPORTED — данные предоставлены сервером. Такие проекты получают меньший вес в независимом рейтинге.',
  },
  {
    q: 'Влияет ли покупка продвижения на рейтинг?',
    a: 'Нет. Платные места отмечены меткой «Продвижение» и не участвуют в формуле независимого рейтинга GameScout.',
  },
  {
    q: 'Как быстро обновляется онлайн?',
    a: 'Мониторинг проверяет серверы автоматически по очереди — обычно каждый сервер не реже раза в 15 минут. На карточке всегда видно источник и время последней проверки; число старше 30 минут помечается как устаревшее.',
  },
]

export default function Owners() {
  const {privateCore,loading}=useAuth()
  if(loading)return <Container className="py-16">Проверяем доступность кабинета…</Container>
  return privateCore?<CoreOwners/>:<LegacyOwners/>
}

function LegacyOwners() {
  useSeo({ title: 'Владельцам серверов', path: '/owners', description: 'Подтвердите владение сервером, подключите Verified Online и голосование с выдачей наград.' })
  const { data: promos = [] } = useAsync(() => promoProducts(), [])

  return (
    <div className="pb-16">
      {/* hero */}
      <section className="relative overflow-hidden pt-12 pb-10 lg:pt-16">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <Badge tone="signal" className="mb-4">
                Бесплатно и навсегда
              </Badge>
              <h1 className="text-[32px] leading-[1.08] sm:text-[44px]">
                Ваш сервер найдут те, кто действительно ищет
              </h1>
              <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-300">
                GameScout — площадка, где игроки выбирают сервер по проверенным данным. Разместите проект, подтвердите
                владение и подключите независимую проверку онлайна.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button to="/add-server" variant="primary" size="lg" iconRight={<ArrowRight size={16} />}>
                  Добавьте сервер бесплатно
                </Button>
                <Button to="/dashboard" variant="outline" size="lg" icon={<LayoutDashboard size={16} />}>
                  Посмотреть кабинет
                </Button>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-ink-400">
                {['Без платы за размещение', 'Без обязательного продвижения', 'Модерация до 24 часов'].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-signal-400" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="surface-raised relative overflow-hidden rounded-2xl p-6">
              <div
                className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full opacity-20 blur-[80px]"
                style={{ background: 'radial-gradient(closest-side, var(--color-signal-500), transparent)' }}
              />
              <div className="relative">
                <div className="text-[12px] tracking-[0.1em] text-ink-500 uppercase">Что видит игрок</div>
                <div className="mt-4 rounded-xl border border-white/8 bg-ink-900/70 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-medium text-ink-50">Ваш сервер</span>
                    <StatusBadge status="VERIFIED" size="sm" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="num font-display text-[30px] leading-none font-semibold text-ink-50">1 284</span>
                    <span className="num text-[13px] text-ink-500">/ 3 000</span>
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-signal-500/90">
                    Проверено GameScout 42 сек. назад
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  {[
                    'Игрок видит источник данных',
                    'Видит время последней проверки',
                    'Видит историю онлайна за 30 дней',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-[13px] text-ink-300">
                      <CheckCircle2 size={14} className="shrink-0 text-signal-400" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* benefits */}
      <Container className="py-10">
        <h2 className="text-[24px] sm:text-[30px]">Что даёт размещение</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className="surface interactive rounded-xl p-5">
              <div className="mb-3.5 grid h-10 w-10 place-items-center rounded-lg border border-white/8 bg-white/[0.035] text-ink-200">
                {benefit.icon}
              </div>
              <h3 className="text-[15px] font-medium text-ink-50">{benefit.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-400">{benefit.body}</p>
            </div>
          ))}
        </div>
      </Container>

      {/* verified online */}
      <Container className="scroll-mt-24 py-10" id="verified">
        <div className="surface rounded-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-signal-400 uppercase">
                <Radar size={13} />
                Verified Online
              </div>
              <h2 className="text-[24px] sm:text-[30px]">Три способа подключить проверку</h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink-300">
                Выберите способ, который поддерживает ваша игра. Проверка бесплатна и выполняется автоматически.
              </p>
            </div>
            <StatusBadge status="VERIFIED" size="lg" />
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            {VERIFY_METHODS.map((method, index) => (
              <div key={method.title} className="rounded-xl border border-white/7 bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/8 bg-white/[0.035] text-signal-400">
                    {method.icon}
                  </span>
                  <span className="num font-mono text-[11px] text-ink-600">0{index + 1}</span>
                </div>
                <h3 className="text-[14.5px] font-medium text-ink-50">{method.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-400">{method.body}</p>
                <div className="mt-3.5 border-t border-white/6 pt-3 text-[12px] text-ink-500">{method.games}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-white/6 pt-6">
            <h3 className="text-[16px]">Это уже ваш сервер?</h3>
            <p className="mt-2 max-w-2xl text-[13.5px] text-ink-400">
              Карточка могла быть добавлена игроками. Подтвердите владение одним из трёх способов — и вы получите
              полный контроль над ней.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {OWNERSHIP_STEPS.map((step, index) => (
                <div key={step.title} className="flex gap-3 rounded-lg border border-white/6 bg-white/[0.02] p-4">
                  <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 font-mono text-[11px] text-ink-300">
                    {index + 1}
                  </span>
                  <div>
                    <div className="text-[13.5px] font-medium text-ink-50">{step.title}</div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button to="/add-server" variant="secondary" className="mt-5">
              Подтвердить владение
            </Button>
          </div>
        </div>
      </Container>

      {/* promo */}
      <Container className="scroll-mt-24 py-10" id="promo">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-promo-300 uppercase">
              <Sparkles size={13} />
              Продвижение
            </div>
            <h2 className="text-[24px] sm:text-[30px]">Платные форматы — по желанию</h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-300">
              Продвижение усиливает видимость, но не влияет на независимый рейтинг и проверку онлайна. Все платные
              места отмечены для игроков.
            </p>
          </div>

          <Button to="/boost" variant="promo" size="lg" icon={<Zap size={15} />}>
            Рассчитать продвижение
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {promos.map((product) => (
            <div
              key={product.id}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-xl border p-5',
                product.accent === 'FEATURED'
                  ? 'border-promo-500/30 bg-promo-900/25'
                  : 'border-white/7 bg-white/[0.02]',
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[17px] font-semibold text-ink-50">{product.name}</h3>
                <span className="rounded-full border border-promo-500/25 bg-promo-500/10 px-2 py-0.5 text-[10px] tracking-[0.08em] text-promo-200 uppercase">
                  {product.tag}
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-400">{product.description}</p>
              <ul className="mt-4 space-y-2">
                {product.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2 text-[12.5px] text-ink-300">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-promo-300" />
                    {bullet}
                  </li>
                ))}
              </ul>
              <div className="mt-auto border-t border-white/6 pt-4">
                <div className="text-[13px] font-medium text-ink-100">{product.priceLabel}</div>
                <div className="mt-1 text-[11.5px] text-ink-500">Оплата появится позже</div>
              </div>
            </div>
          ))}
        </div>
      </Container>

      {/* faq */}
      <Container className="py-10">
        <h2 className="text-[24px] sm:text-[30px]">Частые вопросы</h2>
        <div className="mt-6 max-w-3xl divide-y divide-white/6 overflow-hidden rounded-xl border border-white/7">
          {FAQ.map((item) => (
            <details key={item.q} className="group bg-white/[0.02] px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-[14.5px] text-ink-50">
                {item.q}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-ink-400 transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-400">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>

      {/* final cta */}
      <Container className="py-10">
        <div className="surface relative overflow-hidden rounded-2xl px-6 py-10 text-center sm:px-10">
          <div className="absolute inset-0 texture-grid opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div className="relative">
            <h2 className="text-[26px] sm:text-[32px]">Разместите сервер за 3 минуты</h2>
            <p className="mx-auto mt-3 max-w-lg text-[14.5px] text-ink-300">
              Заполните карточку, подключите проверку онлайна и получайте игроков, которые ищут именно ваш формат.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button to="/add-server" variant="primary" size="lg" iconRight={<ArrowRight size={16} />}>
                Добавить сервер
              </Button>
              <Button href="https://discord.gg" variant="outline" size="lg" icon={<MessageSquare size={16} />}>
                Написать в поддержку
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
