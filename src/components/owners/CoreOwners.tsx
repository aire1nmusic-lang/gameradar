import { ArrowRight, CalendarClock, CheckCircle2, Flame, Mail, Radar, ShieldCheck, Trophy, Users } from 'lucide-react'
import { formatCompact, formatNumber, plural } from '@/lib/format'
import { worldArt } from '@/data/themeMedia'
import { useServers } from '@/hooks/data'
import { useSeo } from '@/lib/seo'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { WorldArtSurface } from '@/components/media/WorldArt'

const CONTACT = 'gamescout.team@gmail.com'
const mailto = (subject: string) => `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent('Игра и хроника / режим:\nНазвание сервера:\nСайт проекта:\nКак с вами связаться:\n')}`

const PLACES = [
  { game: 'lineage2', icon: <Flame size={16} />, title: 'Топ по онлайну', text: 'Место определяет только измеренный онлайн с названным источником. Его нельзя купить.' },
  { game: 'minecraft', icon: <CalendarClock size={16} />, title: 'Скоро открытие', text: 'Дата старта попадает на витрину мира и в календарь открытий с обратным отсчётом.' },
  { game: 'gtarp', icon: <Trophy size={16} />, title: 'Народный рейтинг', text: 'Голоса подтверждённых игроков. Вы сами решаете, чем заслужить их.' },
]

const STEPS = [
  { n: 1, title: 'Найдите свою карточку', text: 'Мы уже собрали серверы Lineage 2, Minecraft и GTA RP из открытых источников. Откройте карточку и нажмите «Это мой сервер».' },
  { n: 2, title: 'Подтвердите права', text: 'Опишите, как проверить владение. Администратор проверит и откроет вам управление именно этим сервером.' },
  { n: 3, title: 'Подключите проверку онлайна', text: 'С проверкой на карточке появляется отметка Verified Online: игроки видят, что число измерено, а не заявлено.' },
]

const FAQ = [
  { q: 'Размещение платное?', a: 'Карточка, место в каталоге, история онлайна и участие в рейтинге бесплатны. Платные форматы продвижения появятся позже и всегда будут помечены как реклама.' },
  { q: 'Можно ли купить место в рейтинге?', a: 'Нет. Порядок по онлайну и Народный рейтинг определяют данные и голоса игроков. Поддержка за Coins — отдельная сортировка и в рейтинг не входит.' },
  { q: 'Моего сервера нет в каталоге.', a: 'Напишите нам: игра, хроника или режим, сайт проекта. Мы проверим данные по открытым источникам и добавим карточку.' },
]

/** The page an owner lands on: what the server gets here, how to connect, what is free. */
export function CoreOwners() {
  useSeo({ title: 'Владельцам серверов', path: '/owners', description: 'Как попасть в топ GameScout: подтвердите сервер, подключите проверку онлайна и получите место по фактам.' })
  const { data: servers = [] } = useServers({ limit: 200 }, true)
  const online = servers.reduce((sum, server) => sum + (server.online.playersKnown === true && server.online.freshness === 'fresh' ? server.online.current : 0), 0)
  const openings = servers.filter((server) => server.launch && Date.parse(server.launch.at) > Date.now()).length

  return (
    <div className="pb-16">
      <section className="relative isolate overflow-hidden">
        <WorldArtSurface art={worldArt('hero', 'lineage2')} scrim="poster" sizes="100vw" width={1600} />
        <Container className="relative py-14 sm:py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[12px] text-white/80 backdrop-blur"><ShieldCheck size={13} /> Владельцам серверов</div>
          <h1 className="mt-4 max-w-2xl text-[32px] leading-[1.1] font-semibold text-white sm:text-[46px]">Пусть игроки находят ваш сервер первым</h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/80">
            GameScout сравнивает серверы по фактам: онлайн с источником, дата открытия, голоса игроков. Подтвердите сервер — и вы на витрине мира, в рейтинге и в поиске.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button to="/catalog" variant="primary" size="lg" iconRight={<ArrowRight size={16} />}>Найти свой сервер</Button>
            <Button href={mailto('Заявка владельца сервера')} variant="outline" size="lg" icon={<Mail size={16} />}>Написать нам</Button>
          </div>
          {servers.length > 0 && (
            <dl className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {[
                [formatNumber(servers.length), plural(servers.length, ['сервер', 'сервера', 'серверов']) + ' в каталоге'],
                [online > 0 ? formatCompact(online) : '—', 'игроков онлайн сейчас'],
                [String(openings), plural(openings, ['открытие', 'открытия', 'открытий']) + ' впереди'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-white/12 bg-black/35 px-3.5 py-3 backdrop-blur">
                  <dt className="num font-display text-[24px] leading-none font-semibold text-white">{value}</dt>
                  <dd className="mt-1.5 text-[11.5px] text-white/65">{label}</dd>
                </div>
              ))}
            </dl>
          )}
        </Container>
      </section>

      <Container className="mt-12">
        <h2 className="text-[24px] sm:text-[28px]">Где вас увидят игроки</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {PLACES.map((place) => (
            <div key={place.title} className="relative isolate flex min-h-[170px] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 p-4">
              <WorldArtSurface art={worldArt('hero', place.game)} scrim="none" sizes="400px" width={800} />
              <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(5,7,11,.95) 10%, rgba(5,7,11,.55) 60%, rgba(5,7,11,.2) 100%)' }} />
              <div className="relative">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-white">{place.icon}{place.title}</div>
                <p className="mt-1.5 text-[13px] leading-snug text-white/75">{place.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Container>

      <Container className="mt-14">
        <h2 className="text-[24px] sm:text-[28px]">Как подключиться</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="surface rounded-2xl p-5">
              <span className="num grid h-8 w-8 place-items-center rounded-full bg-signal-500/15 font-display text-[15px] font-semibold text-signal-300">{step.n}</span>
              <h3 className="mt-3 text-[16px] font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-300">{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13.5px] text-ink-200">
          <Radar size={18} className="mt-0.5 shrink-0 text-signal-300" />
          <p>Регистрация владельцев откроется вместе с запуском личных кабинетов. Чтобы не ждать, напишите на <a className="underline" href={mailto('Заявка владельца сервера')}>{CONTACT}</a>: игра, название, сайт. Мы подготовим карточку заранее.</p>
        </div>
      </Container>

      <Container className="mt-14">
        <h2 className="text-[24px] sm:text-[28px]">Что вы получаете бесплатно</h2>
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {[
            'Карточка сервера со знаком вашей хроники или режима (Interlude, SkyBlock, FiveM…)',
            'Место в «Топ по онлайну» по измеренному числу игроков',
            'Отметка Verified Online при подключённой проверке',
            'История онлайна за 24 часа, 7 и 30 дней',
            'Участие в Народном рейтинге по голосам игроков',
            'Витрина «Скоро открытие» с обратным отсчётом',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-[14px] text-ink-100">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-signal-400" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-center gap-2 text-[13px] text-ink-400"><Users size={14} /> Платным станет только своё: собственная аватарка сервера и форматы продвижения. Реклама всегда с пометкой и не влияет на рейтинг.</p>
      </Container>

      <Container className="mt-14">
        <h2 className="text-[24px] sm:text-[28px]">Частые вопросы</h2>
        <div className="mt-5 max-w-3xl divide-y divide-white/6 overflow-hidden rounded-xl border border-white/7">
          {FAQ.map((item) => (
            <details key={item.q} className="group bg-white/[0.02] px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-[14.5px] text-ink-50">
                {item.q}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-ink-400 transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-400">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </div>
  )
}
