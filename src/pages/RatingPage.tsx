import { useVisualDemo } from '@/hooks/useVisualDemo'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GAMES } from '@/data/games'
import { useAsync } from '@/hooks/data'
import { discoveryServers } from '@/services/catalogService'
import { Container } from '@/components/layout/Container'
import { ChipToggle } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'
import { ServerRow } from '@/components/server/ServerRow'
import { RankPanel, ShelfNote } from '@/components/world/Shelves'
import { useSeo } from '@/lib/seo'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

export default function RatingPage() {
  const demo=useVisualDemo()
  const {game:world} = useWorldNavigation()
  const [params] = useSearchParams()
  const [gameId, setGameId] = useState('all')
  const selected = world?.id ?? gameId
  const {data: servers = [], loading, error, reload} = useAsync(() => discoveryServers({gameId: selected === 'all' ? undefined : selected},demo), [selected,demo], true)
  useSeo({title: 'Рейтинг серверов', path: '/rating', description: 'Поддержка за Coins и отдельный Народный рейтинг по голосам.'})
  const link = (metric: string, expanded: boolean) => {
    const next = new URLSearchParams(params)
    if (expanded) next.delete('all'); else next.set('all', metric)
    return '/rating?' + next.toString()
  }
  return <div className="pb-16"><Container className="pt-6 lg:pt-8">
    <h1 className="text-[26px] leading-tight sm:text-[30px]">Рейтинги серверов{world ? ` ${world.shortName}` : ''}</h1>
    <p className="mt-2 max-w-2xl text-sm text-ink-300">Поддержка и голоса считаются отдельно. Coins не меняют Народный рейтинг.</p>
    {!world && <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto">
      <ChipToggle active={gameId === 'all'} onClick={() => setGameId('all')}>Все игры</ChipToggle>
      {GAMES.filter(g => ['lineage2','minecraft','gtarp'].includes(g.id)).map(g => <ChipToggle key={g.id} active={gameId === g.id} onClick={() => setGameId(g.id)}>{g.shortName}</ChipToggle>)}
    </div>}
    {error ? <Notice tone="warn" className="mt-6">Рейтинг недоступен. <button onClick={reload}>Повторить</button></Notice> : loading ? <p className="mt-6">Загрузка…</p> : <div className="gs-rating-columns mt-6 grid gap-5 md:grid-cols-2">
      {(['support','votes'] as const).map(metric => {
        const expanded = params.get('all') === (metric === 'votes' ? 'people' : metric)
        const rows = servers.filter(s => (metric === 'support' ? s.support?.coins ?? 0 : s.votes) > 0).sort((a,b) => (metric === 'support' ? (b.support?.coins ?? 0) - (a.support?.coins ?? 0) : b.votes - a.votes) || a.name.localeCompare(b.name,'ru'))
        return <RankPanel key={metric} title={metric === 'support' ? 'Поддержка' : 'Народный'} to={link(metric === 'votes' ? 'people' : metric, expanded)} toLabel={expanded ? 'Свернуть' : 'Все'}>
          {rows.length ? (expanded ? rows : rows.slice(0,15)).map((server,index) => <ServerRow key={server.id} server={server} rank={index+1} metric={metric} compact showGame={!world} className={!expanded && index >= 5 ? 'gs-preview-overflow' : undefined}/>) : <ShelfNote title="Рейтинг пока формируется" text={metric === 'support' ? 'Серверы пока не получили поддержку.' : 'В текущем окне пока нет голосов.'}/>}
        </RankPanel>
      })}
    </div>}
  </Container></div>
}
