import type { ChartRange, OnlineSample } from '@/models'

export const historyWindowMs: Record<ChartRange,number> = {
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
}

export type MeasuredHistoryPoint = Omit<OnlineSample,'players'> & {players:number;atMs:number;x:number}

/** Only measured counts at their actual observation times may become chart points. */
export function observedHistory(samples:OnlineSample[],range:ChartRange,now=Date.now()):MeasuredHistoryPoint[] {
  const windowMs=historyWindowMs[range],start=now-windowMs
  return samples.flatMap((sample):MeasuredHistoryPoint[]=>{
    const at=Date.parse(sample.at)
    if(!Number.isFinite(at)||at<start||at>now||typeof sample.players!=='number'
      ||!Number.isFinite(sample.players)||sample.players<0)return []
    return [{...sample,players:sample.players,atMs:at,x:(at-start)/windowMs}]
  }).sort((a,b)=>a.atMs-b.atMs)
}
