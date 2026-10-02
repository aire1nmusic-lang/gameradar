import { formatNumber } from '@/lib/format'
import { historyWindowMs, observedHistory } from '@/lib/onlineHistory'
import type { ChartRange, OnlineSample } from '@/models'

const dateTime=(iso:string)=>new Date(iso).toLocaleString('ru-RU',
  {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})

export function ObservedHistoryChart({samples,range}:{samples:OnlineSample[];range:ChartRange}) {
  const now=Date.now(),points=observedHistory(samples,range,now)
  if(!points.length)return <p className="text-[13px] text-ink-500">
    {samples.length?'Проверки есть, но ни одна не сообщила число игроков за выбранный период.':'История онлайна пока не накоплена.'}
  </p>
  const max=Math.max(1,...points.map(point=>point.players))
  const x=(point:typeof points[number])=>Math.round(point.x*1000)
  const y=(point:typeof points[number])=>Math.round(174-(point.players/max)*150)
  // A line across a long unobserved gap would imply measurements that never happened.
  const maxGap=historyWindowMs[range]/20
  const segments:Array<Array<typeof points[number]>>=[]
  for(const point of points) {
    const previous=segments.at(-1)?.at(-1)
    if(!previous||point.atMs-previous.atMs>maxGap)segments.push([point])
    else segments.at(-1)!.push(point)
  }
  return <div className="space-y-3">
    <div className="overflow-hidden rounded-md border border-white/10 bg-ink-950/40 p-2" role="img"
      aria-label={`История: ${points.length} измерений с ${dateTime(points[0].at)} по ${dateTime(points.at(-1)!.at)}`}>
      <svg viewBox="0 0 1000 200" className="h-28 w-full sm:h-40" preserveAspectRatio="none" aria-hidden="true">
        {[0,0.5,1].map(level=><line key={level} x1="0" x2="1000" y1={174-level*150} y2={174-level*150}
          stroke="currentColor" strokeOpacity="0.1" />)}
        {segments.filter(segment=>segment.length>1).map((segment,index)=><polyline key={index}
          points={segment.map(point=>`${x(point)},${y(point)}`).join(' ')} fill="none"
          stroke="var(--color-ink-300)" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        {points.map((point,index)=><circle key={`${point.at}-${index}`} cx={x(point)} cy={y(point)} r="4"
          fill="var(--color-ink-300)"><title>{dateTime(point.at)} · {formatNumber(point.players)} · {point.sourceName??'Источник не указан'}</title></circle>)}
      </svg>
      <div className="flex justify-between text-[11px] text-ink-400"><span>{dateTime(new Date(now-historyWindowMs[range]).toISOString())}</span><span>{dateTime(new Date(now).toISOString())}</span></div>
    </div>
    <p className="text-[12px] text-ink-400">Точки — фактические измерения. Разрывы означают, что данных между проверками нет.</p>
    <div className="sm:hidden">
      <p className="mb-1 text-[12px] text-ink-300">Последние измерения</p>
      <ul className="divide-y divide-white/7 text-[13px]">{points.slice(-3).reverse().map((point,index)=><li key={`${point.at}-${index}`} className="flex items-baseline justify-between gap-3 py-2">
        <span className="text-ink-300">{dateTime(point.at)}</span><span className="num font-medium text-ink-50">{formatNumber(point.players)}</span>
      </li>)}</ul>
      <p className="mt-1 text-[11px] text-ink-500">Источник: {[...new Set(points.slice(-3).map(point=>point.sourceName??'не указан'))].join(', ')}</p>
    </div>
    <div className="hidden overflow-x-auto sm:block"><table className="w-full text-left text-[12px]">
      <caption className="mb-2 text-left text-ink-300">Последние измерения</caption>
      <thead className="text-ink-400"><tr><th className="py-1 pr-3">Когда измерено</th><th className="py-1 pr-3">Игроков</th><th className="py-1">Источник</th></tr></thead>
      <tbody>{points.slice(-5).reverse().map((point,index)=><tr key={`${point.at}-${index}`} className="border-t border-white/7">
        <td className="py-1.5 pr-3 whitespace-nowrap">{dateTime(point.at)}</td><td className="py-1.5 pr-3">{formatNumber(point.players)}</td>
        <td className="py-1.5 [overflow-wrap:anywhere]">{point.sourceName??'Источник не указан'}{point.fetchedAt&&point.fetchedAt!==point.at?` · получено ${dateTime(point.fetchedAt)}`:''}</td>
      </tr>)}</tbody>
    </table></div>
  </div>
}
