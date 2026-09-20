import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { formatCompact, formatNumber, plural } from '@/lib/format'
import { GAMES } from '@/data/games'
import { serversByGame } from '@/data/servers'
import { Container } from '@/components/layout/Container'
import { GameTile } from '@/components/home/GameTile'
import { ServerRow } from '@/components/server/ServerRow'

export default function Games() {
  const covered = GAMES.filter((game) => serversByGame(game.id).length > 0)

  return (
    <div className="pb-16">
      <Container className="pt-10 lg:pt-14">
        <div className="max-w-2xl">
          <div className="mb-3 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">Игры на GameRadar</div>
          <h1 className="text-[30px] leading-tight sm:text-[40px]">Каталоги по играм</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            Для каждой игры — свои фильтры: версии и хроники, режимы, рейты, регионы. Онлайн проверяется тем способом,
            который поддерживает конкретная игра.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {GAMES.map((game) => (
            <GameTile key={game.id} game={game} />
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { value: formatNumber(GAMES.reduce((sum, g) => sum + g.serversCount, 0)), label: 'серверов во всех играх' },
            {
              value: formatCompact(GAMES.reduce((sum, g) => sum + g.playersOnline, 0)),
              label: 'игроков онлайн прямо сейчас',
            },
            { value: `${GAMES.length}`, label: 'игр в первом охвате' },
          ].map((item) => (
            <div key={item.label} className="surface rounded-xl px-5 py-4">
              <div className="num font-display text-[24px] font-semibold text-ink-50">{item.value}</div>
              <div className="mt-1 text-[13px] text-ink-400">{item.label}</div>
            </div>
          ))}
        </div>

        <section className="mt-14">
          <h2 className="text-[22px] sm:text-[26px]">Лидеры по играм</h2>
          <p className="mt-1.5 text-[13.5px] text-ink-300">
            Серверы с наибольшим проверенным онлайном в каждой игре.
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {covered.map((game) => {
              const servers = serversByGame(game.id)
                .filter((server) => server.online.status !== 'pending')
                .sort((a, b) => b.online.current - a.online.current)
                .slice(0, 3)

              return (
                <div key={game.id} className="surface min-w-0 rounded-xl p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-8 w-1 rounded-full"
                        style={{ background: `linear-gradient(${game.from}, ${game.to})` }}
                      />
                      <div>
                        <h3 className="text-[15px] font-medium text-ink-50">{game.name}</h3>
                        <div className="num text-[12px] text-ink-400">
                          {formatNumber(game.serversCount)}{' '}
                          {plural(game.serversCount, ['сервер', 'сервера', 'серверов'])} ·{' '}
                          {formatCompact(game.playersOnline)} онлайн
                        </div>
                      </div>
                    </div>
                    <Link
                      to={`/catalog?game=${game.id}`}
                      className="group inline-flex items-center gap-1.5 text-[12.5px] text-ink-300 hover:text-ink-50"
                    >
                      Каталог
                      <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>

                  <div className="space-y-1.5">
                    {servers.map((server, index) => (
                      <ServerRow key={server.slug} server={server} rank={index + 1} showTags={false} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </Container>
    </div>
  )
}
