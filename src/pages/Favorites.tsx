import { Heart } from 'lucide-react'
import { formatNumber, plural } from '@/lib/format'
import { SERVERS_BY_SLUG } from '@/data/servers'
import { useFavorites } from '@/hooks/useFavorites'
import { Container } from '@/components/layout/Container'
import { ServerCard } from '@/components/server/ServerCard'
import { EmptyState } from '@/components/ui/feedback'
import { Button } from '@/components/ui/Button'

export default function Favorites() {
  const { favorites, clear } = useFavorites()
  const servers = favorites.map((slug) => SERVERS_BY_SLUG[slug]).filter(Boolean)
  const totalOnline = servers.reduce((sum, server) => sum + server.online.current, 0)

  return (
    <div className="pb-16">
      <Container className="pt-10 lg:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
              <Heart size={13} />
              Избранное
            </div>
            <h1 className="text-[30px] leading-tight sm:text-[40px]">Ваши серверы</h1>
            {servers.length > 0 && (
              <p className="num mt-3 text-[14px] text-ink-300">
                {servers.length} {plural(servers.length, ['сервер', 'сервера', 'серверов'])} ·{' '}
                {formatNumber(totalOnline)} игроков онлайн суммарно
              </p>
            )}
          </div>
          {servers.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Очистить список
            </Button>
          )}
        </div>

        <div className="mt-8">
          {servers.length === 0 ? (
            <EmptyState
              icon={<Heart size={22} />}
              title="Пока ничего не сохранено"
              description="Нажимайте на сердце в карточке сервера — здесь соберётся ваш личный список с актуальным онлайном и напоминаниями об открытиях."
              action="Открыть каталог"
              actionTo="/catalog"
              secondary={
                <Button variant="outline" to="/openings">
                  Смотреть открытия
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {servers.map((server) => (
                <ServerCard key={server.slug} server={server} />
              ))}
            </div>
          )}
        </div>
      </Container>
    </div>
  )
}
