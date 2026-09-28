import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { GAMES } from '@/data/games'
import { useRating } from '@/hooks/data'
import { themeForGame } from '@/data/themes'
import { Container } from '@/components/layout/Container'
import { ChipToggle, Segmented } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'
import { ThemeScope } from '@/theme'
import { BoostedStrip, RatingList, RatingPodium } from '@/components/rating/RatingBoard'
import { useSeo } from '@/lib/seo'
import { useAuth } from '@/hooks/useAuth'
import { apiRequest } from '@/repositories/http/client'
import { plural } from '@/lib/format'

type PeopleRow = { server_id: string; slug: string; name: string; game_id: string; votes: number }
type SupportRow = { server_id: string; slug: string; name: string; game_id: string; coins: number; participants: number }

export default function RatingPage() {
  const { privateCore } = useAuth()
  return privateCore ? <PeopleRatingPage /> : <LegacyRatingPage />
}

function PeopleRatingPage() {
  useSeo({ title: 'Рейтинги серверов', path: '/rating', noindex: true,
    description: 'Народный рейтинг по голосам и отдельная Поддержка за GS Coins.' })
  const [gameId, setGameId] = useState('all')
  const [view,setView] = useState<'people'|'support'>('people')
  const [rows, setRows] = useState<PeopleRow[]>([])
  const [supportRows,setSupportRows] = useState<SupportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    Promise.all([apiRequest<PeopleRow[]>('/people-rating'),apiRequest<SupportRow[]>('/support/ranking')])
      .then(([people,support]) => { if (active) {setRows(people);setSupportRows(support)} })
      .catch(() => { if (active) setError('Рейтинг сейчас недоступен') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const ranked = rows.filter(row => row.votes > 0 && (gameId === 'all' || row.game_id === gameId))
  const supported = supportRows.filter(row => row.coins > 0 && (gameId === 'all' || row.game_id === gameId))
  return <Container className="pb-16 pt-6 lg:pt-8">
    <h1 className="text-[26px] leading-tight sm:text-[30px]">Рейтинги серверов</h1>
    <div className="mt-4"><Segmented value={view} onChange={setView} options={[{value:'people',label:'Народный рейтинг'},{value:'support',label:'Поддержка'}]} /></div>
    <p className="mt-2 max-w-2xl text-[13.5px] text-ink-400">{view==='people'
      ? 'Порядок определяется только голосами подтверждённых аккаунтов в текущем окне. Поддержка за Coins не влияет на позиции. Регистрация не доказывает уникальность человека.'
      : 'Отдельный порядок по сумме GS Coins, переданных серверам. Поддержка не покупает место в Народном рейтинге; карточки визуально равны.'}</p>
    <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto">
      <ChipToggle active={gameId === 'all'} onClick={() => setGameId('all')}>Все игры</ChipToggle>
      {GAMES.filter(game => ['lineage2', 'minecraft', 'gtarp'].includes(game.id)).map(game =>
        <ChipToggle key={game.id} active={gameId === game.id} onClick={() => setGameId(game.id)}>{game.shortName}</ChipToggle>)}
    </div>
    {error ? <Notice tone="warn" className="mt-6">{error}</Notice> : loading ? <p className="mt-6 text-ink-400">Загрузка…</p> : (view==='people'?ranked:supported).length ?
      <ol className="mt-6 space-y-2">{(view==='people'?ranked:supported).map((row, index) => <li key={row.server_id}>
        <Link to={`/server/${row.slug}`} className="surface flex items-center gap-4 rounded-lg p-4 hover:border-white/20">
          <span className="num w-8 text-ink-400">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>
          <span className="num text-sm text-ink-300">{'votes' in row ? `${row.votes} ${plural(row.votes, ['голос', 'голоса', 'голосов'])}` : `${row.coins} Coins · ${row.participants} ${plural(row.participants, ['участник', 'участника', 'участников'])}`}</span>
        </Link>
      </li>)}</ol> : <Notice tone="info" className="mt-6">{view==='people'?'В этой игре пока нет голосов в текущем окне.':'В этой игре серверы пока не получили поддержку.'}</Notice>}
  </Container>
}

type View = 'organic' | 'combined'

/**
 * Platform-wide rating: top three as tiles, the rest as rows. The default is
 * the independent order; the boost-aware order is a labelled switch.
 */
function LegacyRatingPage() {
  useSeo({ title: 'Рейтинг серверов', path: '/rating', description: 'Независимый рейтинг игровых серверов GameScout: онлайн с учётом доверия к источнику, голоса игроков, стабильность.' })
  const [gameId, setGameId] = useState<string>('all')
  const [view, setView] = useState<View>('organic')

  const scope = gameId === 'all' ? undefined : gameId
  const { data: organic = [] } = useRating({ gameId: scope })
  const { data: combined = [] } = useRating({ gameId: scope, sponsored: true })
  const entries = view === 'organic' ? organic : combined
  const theme = useMemo(() => themeForGame(gameId === 'all' ? 'core' : gameId), [gameId])

  return (
    <div className="pb-16">
      <Container className="pt-6 lg:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
              <Trophy size={13} />
              Рейтинг
            </div>
            <h1 className="text-[26px] leading-tight sm:text-[30px]">ТОП серверов</h1>
            <p className="mt-2 max-w-xl text-[13.5px] text-ink-400">Онлайн с учётом доверия к источнику, стабильность и голоса игроков. Продвижение на позиции не влияет.</p>
          </div>
          <Segmented
            value={view}
            onChange={setView}
            size="sm"
            options={[
              { value: 'organic', label: 'Независимый' },
              { value: 'combined', label: 'С продвижением' },
            ]}
          />
        </div>

        {view === 'combined' && (
          <Notice tone="warn" className="mt-4" title="Это витрина, а не рейтинг">
            В этом режиме сервер может стоять выше за счёт оплаты. GameScout показывает такой порядок только по явному запросу.
          </Notice>
        )}

        <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
          <ChipToggle active={gameId === 'all'} onClick={() => setGameId('all')} className="shrink-0">
            Все игры
          </ChipToggle>
          {GAMES.slice(0, 6).map((item) => (
            <ChipToggle key={item.id} active={gameId === item.id} accent={item.accent} onClick={() => setGameId(item.id)} className="shrink-0">
              {item.shortName}
            </ChipToggle>
          ))}
        </div>

        <ThemeScope theme={theme} as="div" className="mt-6">
          {entries.length > 0 ? (
            <div className="space-y-6">
              <RatingPodium entries={entries} />
              <RatingList entries={entries} />
              {view === 'organic' && <BoostedStrip entries={combined} limit={4} />}
            </div>
          ) : (
            <Notice tone="info">В этой игре пока нет серверов с достаточными данными для рейтинга.</Notice>
          )}
        </ThemeScope>
      </Container>
    </div>
  )
}
