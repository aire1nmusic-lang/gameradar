import { useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useGames } from '@/hooks/data'
import { ShelfCard, ShelfRail } from '@/components/world/Shelves'
import { plural } from '@/lib/format'
import { useOpenings } from '@/hooks/data'
import { Container } from '@/components/layout/Container'
import { LaunchRow } from '@/components/server/LaunchRow'
import { Segmented } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'
import { useSeo } from '@/lib/seo'

type Window = 'today' | 'week' | 'all'
type Scope = 'all' | string

const DAY = 86_400_000

/** Announced openings as a calendar: one row per server, grouped by day. */
export default function Openings() {
  useSeo({ title: 'Открытия серверов', path: '/openings', description: 'Ближайшие открытия игровых серверов: дата, время и хроника.' })
  const [window, setWindow] = useState<Window>('all')
  const [gameId, setGameId] = useState<Scope>('all')
  const { data: games = [] } = useGames()
  const { data: all = [] } = useOpenings(undefined, 40)

  const filtered = useMemo(() => {
    const now = Date.now()
    return all.filter((server) => {
      if (gameId !== 'all' && server.gameId !== gameId) return false
      const diff = new Date(server.launch?.at ?? 0).getTime() - now
      if (window === 'today') return diff < DAY
      if (window === 'week') return diff < 7 * DAY
      return true
    })
  }, [all, window, gameId])

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const server of filtered) {
      const date = new Date(server.launch?.at ?? Date.now())
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      map.set(key, [...(map.get(key) ?? []), server])
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <div className="pb-16">
      <Container className="pt-6 lg:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
              <CalendarClock size={13} />
              Открытия
            </div>
            <h1 className="text-[26px] leading-tight sm:text-[30px]">Что открывается в ближайшие дни</h1>
          </div>
          <Segmented
            value={window}
            onChange={setWindow}
            options={[
              { value: 'today', label: 'Сегодня' },
              { value: 'week', label: 'На неделе' },
              { value: 'all', label: 'Все' },
            ]}
          />
        </div>

        {games.length > 1 && (
          <div className="mt-5">
            <Segmented
              value={gameId}
              onChange={setGameId}
              size="sm"
              options={[{ value: 'all', label: 'Все игры' }, ...games.map((game) => ({ value: game.id, label: game.shortName }))]}
            />
          </div>
        )}

        {filtered.length > 0 && (
          <ShelfRail eyebrow={<><CalendarClock size={12} /> Ближайшие</>} title="Открываются первыми">
            {filtered.slice(0, 8).map((server) => <ShelfCard key={server.slug} server={server} metric="opening" />)}
          </ShelfRail>
        )}

        <div className="mt-10 space-y-8">
          {groups.length === 0 ? (
            <EmptyState title="В этом диапазоне открытий нет" description="Попробуйте расширить период или посмотрите недавно добавленные серверы." action="Смотреть каталог" actionTo="/catalog?sort=new" />
          ) : (
            groups.map(([key, servers]) => {
              const date = new Date(servers[0].launch?.at ?? Date.now())
              const today = new Date()
              const isToday = date.toDateString() === today.toDateString()
              const isTomorrow = date.toDateString() === new Date(today.getTime() + DAY).toDateString()
              return (
                <section key={key}>
                  <div className="mb-3 flex items-center gap-3">
                    <h2 className="text-[16px]">{isToday ? 'Сегодня' : isTomorrow ? 'Завтра' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</h2>
                    <span className="h-px flex-1 bg-white/7" />
                    <span className="num text-[12.5px] text-ink-500">
                      {servers.length} {plural(servers.length, ['сервер', 'сервера', 'серверов'])}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {servers.map((server) => (
                      <LaunchRow key={server.slug} server={server} />
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </div>
      </Container>
    </div>
  )
}
