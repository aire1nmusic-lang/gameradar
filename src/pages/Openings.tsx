import { useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { formatNumber, plural } from '@/lib/format'
import { useOpenings } from '@/hooks/data'
import { Container } from '@/components/layout/Container'
import { LaunchCard } from '@/components/server/LaunchCard'
import { Segmented } from '@/components/ui/controls'
import { EmptyState, Notice } from '@/components/ui/feedback'

type Window = 'today' | 'week' | 'all'

const DAY = 86_400_000

export default function Openings() {
  const [window, setWindow] = useState<Window>('all')
  const { data: all = [] } = useOpenings(undefined, 20)

  const filtered = useMemo(() => {
    const now = Date.now()
    return all.filter((server) => {
      const diff = new Date(server.launch!.at).getTime() - now
      if (window === 'today') return diff < DAY
      if (window === 'week') return diff < 7 * DAY
      return true
    })
  }, [all, window])

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const server of filtered) {
      const date = new Date(server.launch!.at)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      map.set(key, [...(map.get(key) ?? []), server])
    }
    return Array.from(map.entries())
  }, [filtered])

  const totalInterest = filtered.reduce((sum, server) => sum + (server.launch?.preRegistrations ?? 0), 0)

  return (
    <div className="pb-16">
      <Container className="pt-10 lg:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
              <CalendarClock size={13} />
              Открытия
            </div>
            <h1 className="text-[30px] leading-tight sm:text-[40px]">Что открывается в ближайшие дни</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
              Старт сервера — лучший момент, чтобы начать с нуля вместе со всеми. Здесь только заявленные открытия с
              подтверждённой датой.
            </p>
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

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat value={String(filtered.length)} label={plural(filtered.length, ['открытие', 'открытия', 'открытий'])} />
          <Stat value={formatNumber(totalInterest)} label="предрегистраций суммарно" />
          <Stat value="0" label="серверов с онлайном до старта" hint="GameRadar не показывает онлайн до запуска" />
        </div>

        <Notice tone="info" className="mt-6">
          До момента запуска GameRadar не публикует никаких показателей онлайна — даже заявленных владельцем. Интерес
          отражают только предрегистрации.
        </Notice>

        <div className="mt-10 space-y-10">
          {groups.length === 0 ? (
            <EmptyState
              title="В этом диапазоне открытий нет"
              description="Попробуйте расширить период или посмотрите недавно добавленные серверы."
              action="Смотреть каталог"
              actionTo="/catalog?sort=new"
            />
          ) : (
            groups.map(([key, servers]) => {
              const date = new Date(servers[0].launch!.at)
              const today = new Date()
              const isToday = date.toDateString() === today.toDateString()
              const isTomorrow = date.toDateString() === new Date(today.getTime() + DAY).toDateString()
              return (
                <section key={key}>
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-[17px]">
                      {isToday
                        ? 'Сегодня'
                        : isTomorrow
                          ? 'Завтра'
                          : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                    </h2>
                    <span className="h-px flex-1 bg-white/7" />
                    <span className="num text-[12.5px] text-ink-500">
                      {servers.length} {plural(servers.length, ['сервер', 'сервера', 'серверов'])}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {servers.map((server) => (
                      <LaunchCard key={server.slug} server={server} fluid />
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

function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="surface rounded-xl px-5 py-4">
      <div className="num font-display text-[24px] font-semibold text-ink-50">{value}</div>
      <div className="mt-1 text-[13px] text-ink-400">{label}</div>
      {hint && <div className="mt-1 text-[11.5px] text-ink-500">{hint}</div>}
    </div>
  )
}
