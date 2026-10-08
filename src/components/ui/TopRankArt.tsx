import './top-ranks.css'

const images = ['gold', 'silver', 'bronze'] as const

/** Decorative rank scenery; names, scores and actions remain ordinary accessible UI. */
export function TopRankArt({ rank, gameId }: { rank?: number; gameId: string }) {
  if (!rank || rank > 3 || gameId !== 'lineage2') return null
  return <span className="gs-top-rank-art" aria-hidden="true">
    <img src={`/media/ranks/${images[rank - 1]}-v1.webp`} alt="" width={960} height={320} loading="lazy" decoding="async" />
  </span>
}
