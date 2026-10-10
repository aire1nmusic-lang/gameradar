import { Link } from 'react-router-dom'
import { useOpenings, useRecentlyAdded, useServers } from '@/hooks/data'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'
import { artSrc, serverArt } from '@/data/themeMedia'
import { formatNumber } from '@/lib/format'
import type { GameServer } from '@/models'

type Item = { key: string; server: GameServer; label: string; value: string }

const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' })

/** Live strip under the header: only real catalogue facts — new listings, announced starts, measured online. */
export function LiveTicker() {
  const { game } = useWorldNavigation()
  const gameId = game?.id
  const added = useRecentlyAdded(gameId, 4).data ?? []
  const openings = useOpenings(gameId, 4).data ?? []
  const online: GameServer[] = useServers({ gameId, sort: 'online', limit: 6 }).data ?? []

  const items: Item[] = [
    ...openings.filter(s => s.launch).map(s => ({ key: 'o' + s.id, server: s, label: 'Открытие', value: day.format(new Date(s.launch!.at)) })),
    ...added.map(s => ({ key: 'a' + s.id, server: s, label: 'Новый в каталоге', value: s.version || '' })),
    ...online.filter(s => s.online.playersKnown && s.online.current > 0).map(s => ({ key: 'n' + s.id, server: s, label: 'Онлайн', value: formatNumber(s.online.current) })),
  ]
  if (!items.length) return null
  const strip = items.map(item => {
    const art = serverArt(item.server)
    return (
      <Link key={item.key} to={`/server/${item.server.slug}`} className="gs-live-item" tabIndex={-1}>
        {art && <img src={artSrc(art, Math.min(...art.widths))} alt="" width={26} height={26} loading="lazy" />}
        <span>{item.label}</span>
        <b>{item.server.name}</b>
        {item.value && <em>{item.value}</em>}
      </Link>
    )
  })
  return (
    <div className="gs-live" aria-label="Что происходит в каталоге">
      <span className="gs-live-tag">LIVE</span>
      <div className="gs-live-view">
        <div className="gs-live-track" style={{ animationDuration: `${Math.max(30, items.length * 6)}s` }}>
          {strip}
          <span aria-hidden="true" className="contents">{strip}</span>
        </div>
      </div>
    </div>
  )
}
