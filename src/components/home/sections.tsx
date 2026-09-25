import { Flame, CalendarClock, Sparkles } from 'lucide-react'
import { useOpenings, useRecentlyAdded, useServers } from '@/hooks/data'
import { Container } from '@/components/layout/Container'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { ServerList, ServerRowSkeleton } from '@/components/server/ServerRow'
import { LaunchRow } from '@/components/server/LaunchRow'

function RowsSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: count }).map((_, index) => (
        <ServerRowSkeleton key={index} />
      ))}
    </div>
  )
}

/**
 * Where players are right now: the ten largest fresh player counts, whatever
 * the source. The source is one hover away; the list itself stays readable.
 */
export function HighOnlineSection() {
  const { data: page, loading } = useServers({ sort: 'online', limit: 24 }, true)
  const servers = (page ?? [])
    .filter((server) => server.online.freshness === 'fresh' && server.online.playersKnown !== false && server.online.current > 0)
    .slice(0, 10)
  if (!loading && servers.length === 0) return null

  return (
    <section className="py-8 sm:py-10">
      <Container>
        <SectionHeader
          eyebrow={
            <>
              <Flame size={13} /> Сейчас онлайн
            </>
          }
          title="Где играют прямо сейчас"
          action="Весь каталог"
          actionTo="/catalog?sort=online"
        />
        {loading ? <RowsSkeleton count={6} /> : <ServerList servers={servers} ranked />}
      </Container>
    </section>
  )
}

export function OpeningsSection() {
  const { data: servers = [] } = useOpenings(undefined, 5)
  if (servers.length === 0) return null
  return (
    <section className="py-8 sm:py-10">
      <Container>
        <SectionHeader
          eyebrow={
            <>
              <CalendarClock size={13} /> Открытия
            </>
          }
          title="Стартуют в ближайшие дни"
          action="Все открытия"
          actionTo="/openings"
        />
        <div className="space-y-1.5">
          {servers.map((server) => (
            <LaunchRow key={server.slug} server={server} />
          ))}
        </div>
      </Container>
    </section>
  )
}

/** New cards worth a look: only those whose online is already known. */
export function RecentlyAddedSection() {
  const { data: servers, loading } = useRecentlyAdded(undefined, 12)
  const known = (servers ?? []).filter((server) => server.online.playersKnown !== false && server.online.current > 0).slice(0, 5)
  if (!loading && known.length === 0) return null
  return (
    <section className="py-8 sm:py-10">
      <Container>
        <SectionHeader
          eyebrow={
            <>
              <Sparkles size={13} /> Новые в каталоге
            </>
          }
          title="Недавно добавленные"
          action="Все новые"
          actionTo="/catalog?sort=new"
        />
        {loading ? <RowsSkeleton count={4} /> : <ServerList servers={known} />}
      </Container>
    </section>
  )
}
