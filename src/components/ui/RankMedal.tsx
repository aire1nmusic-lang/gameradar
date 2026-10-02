import { cn } from '@/lib/utils'

export const MEDAL: Record<number, { bg: string; ring: string; text: string }> = {
  1: { bg: 'linear-gradient(145deg,#ffe08a,#e0a82e 55%,#b9791a)', ring: 'rgba(255,214,102,.55)', text: '#3b2503' },
  2: { bg: 'linear-gradient(145deg,#f3f5f8,#b8c0cc 55%,#8c96a5)', ring: 'rgba(214,222,235,.5)', text: '#222a35' },
  3: { bg: 'linear-gradient(145deg,#f1c19a,#cd7f44 55%,#955224)', ring: 'rgba(222,150,96,.5)', text: '#3a1c07' },
}

/** Place in a ranking: gold, silver and bronze for the top three, a quiet number after. */
export function RankMedal({ rank, className }: { rank: number; className?: string }) {
  const medal = MEDAL[rank]
  return (
    <span
      className={cn(
        'num grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-[13px] font-bold',
        !medal && 'text-ink-500',
        className,
      )}
      style={medal ? { background: medal.bg, color: medal.text, boxShadow: `0 0 0 2px ${medal.ring}, 0 4px 10px -4px rgba(0,0,0,.8)` } : undefined}
    >
      {rank}
    </span>
  )
}
