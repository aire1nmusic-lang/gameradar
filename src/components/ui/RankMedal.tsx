import { cn } from '@/lib/utils'

export const MEDAL: Record<number, { bg: string; ring: string; text: string }> = {
  1: { bg: 'linear-gradient(160deg,#f8dda0 0%,#c99534 58%,#765019 100%)', ring: 'rgba(226,188,104,.50)', text: '#2b1d08' },
  2: { bg: 'linear-gradient(160deg,#eef1f5 0%,#a9b2bf 58%,#5f6876 100%)', ring: 'rgba(196,205,218,.42)', text: '#1f2630' },
  3: { bg: 'linear-gradient(160deg,#e8b68f 0%,#b96f3f 58%,#6f3d25 100%)', ring: 'rgba(205,132,83,.42)', text: '#26150c' },
}

/** Small numbered rank badge; color supplements the readable number. */
export function RankMedal({ rank, className }: { rank: number; className?: string }) {
  const medal = MEDAL[rank]
  return (
    <span
      aria-label={`Место ${rank}`}
      className={cn(
        'gs-rank-medal num grid h-8 w-7 shrink-0 place-items-center font-sans text-[12px] font-bold',
        !medal && 'text-ink-400',
        className,
      )}
      style={{
        background: medal?.bg ?? 'linear-gradient(160deg,rgba(255,255,255,.11),rgba(255,255,255,.035))',
        color: medal?.text,
        boxShadow: medal ? `inset 0 1px 0 rgba(255,255,255,.35), 0 5px 12px -7px ${medal.ring}` : 'inset 0 0 0 1px rgba(255,255,255,.10)',
      }}
    >
      {rank}
    </span>
  )
}
