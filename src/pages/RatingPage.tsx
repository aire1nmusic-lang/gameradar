import { useMemo, useState } from 'react'
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

type View = 'organic' | 'combined'

/**
 * Platform-wide rating: top three as tiles, the rest as rows. The default is
 * the independent order; the boost-aware order is a labelled switch.
 */
export default function RatingPage() {
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
