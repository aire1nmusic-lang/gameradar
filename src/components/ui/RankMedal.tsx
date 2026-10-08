import { cn } from '@/lib/utils'
import { Crown } from 'lucide-react'
import './top-ranks.css'

export const MEDAL: Record<number, { bg: string; ring: string; text: string }> = {
  1: { bg: 'linear-gradient(160deg,#f8dda0 0%,#c99534 58%,#765019 100%)', ring: 'rgba(226,188,104,.50)', text: '#2b1d08' },
  2: { bg: 'linear-gradient(160deg,#eef1f5 0%,#a9b2bf 58%,#5f6876 100%)', ring: 'rgba(196,205,218,.42)', text: '#1f2630' },
  3: { bg: 'linear-gradient(160deg,#e8b68f 0%,#b96f3f 58%,#6f3d25 100%)', ring: 'rgba(205,132,83,.42)', text: '#26150c' },
}

/** Small numbered rank badge; color supplements the readable number. */
export function RankMedal({ rank, className, neutral=false }: { rank: number; className?: string; neutral?: boolean }) {
  // Color identifies the displayed position, including tied/rotating zero scores.
  const medal = MEDAL[rank]
  return (
    <span
      aria-label={`Место ${rank}`}
      data-score-tied={neutral || undefined}
      className={cn(
        'gs-rank-medal gs-rank-number num grid h-8 w-7 shrink-0 place-items-center font-sans text-[12px] font-bold',
        medal && `gs-rank-podium gs-rank-${rank}`,
        !medal && 'text-ink-400',
        className,
      )}
      style={{
        background: medal?.bg,
        color: medal?.text,
        borderColor: medal?.ring,
        boxShadow: 'none',

      }}
    >
      {rank === 1 && <Crown size={11} aria-hidden="true" />}
      <span>{rank}</span>
    </span>
  )
}

