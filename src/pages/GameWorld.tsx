import { useRankingPeriod } from '@/hooks/useRankingRotation'
import type { GameServer } from '@/models'
import { LineageDiscovery } from '@/components/world/LineageDiscovery'
import { useVisualDemo } from '@/hooks/useVisualDemo'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import NotFound from './NotFound'
import { resolveWorld } from '@/data/themes'
import { useAsync } from '@/hooks/data'
import { discoveryServers } from '@/services/catalogService'
import { ThemeScope } from '@/theme'
import { lightWorldTheme } from '@/theme/lightWorld'
import { breadcrumbs, gamePreviewImage, useSeo } from '@/lib/seo'
import { useAppearance } from '@/theme/appearance'
import { WorldGuide, faqJsonLd, worldSeo } from '@/components/world/WorldGuide'

/**
 * A game world: /minecraft, /lineage-2, /lineage-2/interlude.
 * Same platform, same data, its own key art and palette — and the list of
 * servers on the first screen.
 */
export default function GameWorld() {
  const { gameSlug, chronicleSlug } = useParams()
  const world = resolveWorld(gameSlug, chronicleSlug)
  // Arriving through a gate of the hall: the world opens out of its own colour.
  const fromPortal = !!(useLocation().state as { portal?: boolean } | null)?.portal
  const { colorMode } = useAppearance()
  const isLineage2 = world.game?.id === 'lineage2'
  const activeTheme = colorMode === 'light' ? lightWorldTheme(world.theme) : world.theme

  // unknown single-segment url — this route sits below every static route
  if (!world.game) return <NotFound />
  if (chronicleSlug && !world.chronicle) return <Navigate to={`/${world.game.slug}`} replace />

  const scopeClass = [fromPortal ? 'gs-world-enter' : '', 'relative gs-discovery-world', isLineage2 ? 'gs-lineage-aether' : '', colorMode === 'light' ? 'gs-world-light' : ''].filter(Boolean).join(' ')
  return (
    <ThemeScope theme={activeTheme} as="div" className={scopeClass}>
      <WorldBody
        gameSlug={world.game.slug}
        chronicleSlug={world.chronicle?.slug}
        key={`${world.game.slug}-${world.chronicle?.slug ?? 'all'}`}
      />
    </ThemeScope>
  )
}

function WorldBody({ gameSlug, chronicleSlug }: { gameSlug: string; chronicleSlug?: string }) {
  const demo=useVisualDemo()
  const rankingPeriod=useRankingPeriod()
  const { game, chronicle } = resolveWorld(gameSlug, chronicleSlug)
  const worldName = [game?.name, chronicle?.label].filter(Boolean).join(' ')
  const worldPath = '/' + [game?.slug, chronicle?.slug].filter(Boolean).join('/')
  const seo = game ? worldSeo(game, chronicle) : null
  useSeo({
    title: seo?.title ?? `Серверы ${worldName}`,
    path: worldPath,
    image: gamePreviewImage(game?.id),
    description: seo?.description ?? `Серверы ${worldName} в каталоге GameScout: онлайн с указанием источника, открытия, рейтинг и голосование.`,
    jsonLd: [
      ...(seo?.faq.length ? [faqJsonLd(seo.faq)] : []),
      breadcrumbs([
        { name: 'GameScout', path: '/' },
        ...(game ? [{ name: game.name, path: '/' + game.slug }] : []),
        ...(game && chronicle ? [{ name: chronicle.label, path: worldPath }] : []),
      ]),
    ],
  })
  const { data: servers = [], loading, error, reload } = useAsync<GameServer[]>(publish => discoveryServers({gameId: game?.id, chronicleId: chronicle?.id},demo,publish), [game?.id, chronicle?.id,demo,rankingPeriod], true)

  if (!game) return null
  if (game) return <>
    <LineageDiscovery game={game} chronicle={chronicle} servers={servers} loading={loading} error={error} reload={reload} demo={demo} />
    <WorldGuide game={game} chronicle={chronicle} count={loading || error || demo ? null : servers.length} />
  </>
  return null
}

