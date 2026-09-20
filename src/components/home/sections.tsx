import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, Flame, Sparkles, TrendingUp } from 'lucide-react'
import { GAMES } from '@/data/games'
import { highOnline, openingServers, promotedServers, recentlyAdded, risingServers } from '@/data/servers'
import { Container } from '@/components/layout/Container'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { GameTile } from './GameTile'
import { ServerCard } from '@/components/server/ServerCard'
import { ServerRow } from '@/components/server/ServerRow'
import { LaunchCard } from '@/components/server/LaunchCard'
import { Button } from '@/components/ui/Button'

export function GamesSection() {
  return (
    <section className="py-10 sm:py-12">
      <Container>
        <SectionHeader
          eyebrow={<>Популярные игры</>}
          title="Выберите игру"
          description="Каждая игра — свой каталог серверов с отдельными фильтрами: версии, хроники, режимы и рейты."
          action="Все игры"
          actionTo="/games"
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {GAMES.slice(0, 6).map((game) => (
            <GameTile key={game.id} game={game} />
          ))}
        </div>
        <div className="mt-4 sm:hidden">
          <Button to="/games" variant="outline" full iconRight={<ArrowRight size={15} />}>
            Все игры
          </Button>
        </div>
      </Container>
    </section>
  )
}

export function OpeningsSection() {
  const servers = openingServers(5)
  return (
    <section className="py-10 sm:py-12">
      <Container>
        <SectionHeader
          eyebrow={
            <>
              <CalendarClock size={13} /> Открываются сегодня и на неделе
            </>
          }
          title="Новые открытия"
          description="Серверы, которые стартуют в ближайшие дни. Подпишитесь на напоминание, чтобы зайти в первый час."
          action="Все открытия"
          actionTo="/openings"
        />
      </Container>

      <div className="relative">
        <Container>
          <div className="rail -mx-5 px-5 sm:mx-0 sm:px-0">
            {servers.map((server) => (
              <LaunchCard key={server.slug} server={server} />
            ))}
            <Link
              to="/openings"
              className="group flex w-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-ink-400 transition-colors hover:border-white/20 hover:text-ink-100"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 transition-transform duration-200 group-hover:translate-x-0.5">
                <ArrowRight size={16} />
              </span>
              <span className="text-[13px]">Все открытия</span>
            </Link>
          </div>
        </Container>
      </div>
    </section>
  )
}

export function HighOnlineSection() {
  const servers = highOnline(6)
  return (
    <section className="py-10 sm:py-12">
      <Container>
        <SectionHeader
          eyebrow={
            <>
              <Flame size={13} /> Сейчас высокий онлайн
            </>
          }
          title="Где играют прямо сейчас"
          description="Только серверы с онлайном, который GameRadar проверил самостоятельно."
          action="Смотреть каталог"
          actionTo="/catalog?sort=online&verified=1"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <ServerCard key={server.slug} server={server} />
          ))}
        </div>
      </Container>
    </section>
  )
}

export function RisingSection() {
  const servers = risingServers(5)
  return (
    <section className="py-10 sm:py-12">
      <Container>
        <SectionHeader
          eyebrow={
            <>
              <TrendingUp size={13} /> Быстро растут
            </>
          }
          title="Проекты с ростом онлайна"
          description="Рост считается по проверенным данным за последние 24 часа."
          action="Весь рейтинг роста"
          actionTo="/catalog?sort=growth"
        />
        <div className="surface overflow-hidden rounded-xl p-2 sm:p-3">
          <div className="space-y-1.5">
            {servers.map((server, index) => (
              <ServerRow key={server.slug} server={server} rank={index + 1} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}

export function PromotedSection() {
  const servers = promotedServers(3)
  return (
    <section className="py-10 sm:py-12">
      <Container>
        <div className="relative overflow-hidden rounded-2xl border border-promo-500/18 bg-promo-900/25 p-5 sm:p-7">
          <div
            className="pointer-events-none absolute -top-24 -right-10 h-64 w-64 rounded-full opacity-25 blur-[80px]"
            style={{ background: 'radial-gradient(closest-side, var(--color-promo-500), transparent)' }}
          />

          <div className="relative mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-promo-500/30 bg-promo-500/12 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-promo-200 uppercase">
                  <Sparkles size={11} />
                  Продвижение
                </span>
              </div>
              <h2 className="text-[22px] sm:text-[26px]">TOP серверы</h2>
              <p className="mt-1.5 max-w-xl text-[13.5px] text-ink-300">
                Платные места владельцев серверов. Не влияют на независимый рейтинг GameRadar и на проверку онлайна.
              </p>
            </div>
            <Link
              to="/rating"
              className="group inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-[13px] text-ink-200 transition-colors hover:border-white/22 hover:text-ink-50"
            >
              Независимый рейтинг
              <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => (
              <ServerCard key={server.slug} server={server} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}

export function RecentlyAddedSection() {
  const servers = recentlyAdded(4)
  return (
    <section className="py-10 sm:py-12">
      <Container>
        <SectionHeader
          title="Недавно добавленные"
          description="Свежие проекты в каталоге. Часть из них ещё проходит проверку онлайна."
          action="Все новые"
          actionTo="/catalog?sort=new"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {servers.map((server) => (
            <ServerCard key={server.slug} server={server} />
          ))}
        </div>
      </Container>
    </section>
  )
}
