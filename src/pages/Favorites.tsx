import { Heart } from 'lucide-react'
import { formatNumber, plural } from '@/lib/format'
import { useServers } from '@/hooks/data'
import { useFavorites } from '@/hooks/useFavorites'
import { Container } from '@/components/layout/Container'
import { ServerList } from '@/components/server/ServerRow'
import { EmptyState } from '@/components/ui/feedback'
import { Button } from '@/components/ui/Button'
import { useSeo } from '@/lib/seo'

export default function Favorites() {
  useSeo({ title: 'Избранное', noindex: true })
  const { favorites, clear } = useFavorites()
  const { data: all = [] } = useServers({ limit: 500 })
  const servers = favorites.map((slug) => all.find((server) => server.slug === slug)).filter(Boolean) as typeof all
  const totalOnline = servers.reduce((sum, server) => sum + server.online.current, 0)

  return (
    <div className="pb-16">
      <Container className="pt-6 lg:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
              <Heart size={13} />
              Избранное
            </div>
            <h1 className="text-[26px] leading-tight sm:text-[30px]">Ваши серверы</h1>
            {servers.length > 0 && (
              <p className="num mt-2 text-[13.5px] text-ink-300">
                {servers.length} {plural(servers.length, ['сервер', 'сервера', 'серверов'])} · {formatNumber(totalOnline)} игроков онлайн суммарно
              </p>
            )}
          </div>
          {servers.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Очистить список
            </Button>
          )}
        </div>

        <div className="mt-6">
          {servers.length === 0 ? (
            <EmptyState
              icon={<Heart size={22} />}
              title="Пока ничего не сохранено"
              description="Нажимайте на сердце у сервера — здесь соберётся ваш личный список с актуальным онлайном."
              action="Открыть каталог"
              actionTo="/catalog"
              secondary={
                <Button variant="outline" to="/openings">
                  Смотреть открытия
                </Button>
              }
            />
          ) : (
            <ServerList servers={servers} />
          )}
        </div>
      </Container>
    </div>
  )
}
