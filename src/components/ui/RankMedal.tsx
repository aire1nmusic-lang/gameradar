import { cn } from '@/lib/utils'

export const MEDAL: Record<number, { bg: string; ring: string; text: string }> = {
  1: { bg: 'linear-gradient(160deg,#f8dda0 0%,#c99534 58%,#765019 100%)', ring: 'rgba(226,188,104,.50)', text: '#2b1d08' },
  2: { bg: 'linear-gradient(160deg,#eef1f5 0%,#a9b2bf 58%,#5f6876 100%)', ring: 'rgba(196,205,218,.42)', text: '#1f2630' },
  3: { bg: 'linear-gradient(160deg,#e8b68f 0%,#b96f3f 58%,#6f3d25 100%)', ring: 'rgba(205,132,83,.42)', text: '#26150c' },
}

/** Small numbered rank badge; color supplements the readable number. */
export function RankMedal({ rank, className, neutral=false }: { rank: number; className?: string; neutral?: boolean }) {
  const medal = neutral ? undefined : MEDAL[rank]
  return (
    <span
      aria-label={`Место ${rank}`}
      className={cn(
        'gs-rank-medal gs-rank-number num grid h-8 w-7 shrink-0 place-items-center font-sans text-[12px] font-bold',
        !medal && 'text-ink-400',
        className,
      )}
      style={{
        background: 'transparent',
        color: medal ? (rank===1?'var(--rank-gold,#d1ac65)':rank===2?'var(--rank-silver,#b6c6d4)':'var(--rank-bronze,#cb946f)') : undefined,
        borderColor: medal?.ring,
        boxShadow: 'none',

      }}
    >
      {rank}
    </span>
  )
}
