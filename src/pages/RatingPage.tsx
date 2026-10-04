import { useVisualDemo } from '@/hooks/useVisualDemo'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GAMES } from '@/data/games'
import { useAsync } from '@/hooks/data'
import { discoveryServers, invalidateDiscoveryCache } from '@/services/catalogService'
import { peopleOrder, supportOrder } from '@/services/supportProjection'
import { Container } from '@/components/layout/Container'
import { ChipToggle } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'
import { ServerRow } from '@/components/server/ServerRow'
import { RankPanel, ShelfNote } from '@/components/world/Shelves'
import { SupportStudio } from '@/components/rating/SupportStudio'
import { WorldIcon } from '@/components/icons/WorldIcon'
import { useSeo } from '@/lib/seo'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

export default function RatingPage() {
 const demo=useVisualDemo(),{game:world}=useWorldNavigation(),[params]=useSearchParams(),[gameId,setGameId]=useState('all')
 const selected=world?.id??gameId
 const contextKey=`${selected}-${demo}`
 const {data:result,loading,error,reload}=useAsync(async()=>({contextKey,servers:await discoveryServers({gameId:selected==='all'?undefined:selected},demo)}),[selected,demo],true)
 const servers=result?.contextKey===contextKey?result.servers:[]
 useEffect(()=>{const timer=window.setInterval(()=>{if(document.visibilityState==='visible')reload()},30000);return()=>clearInterval(timer)},[reload])
 const supported=()=>{invalidateDiscoveryCache();reload()}
 useSeo({title:'Рейтинг серверов',path:'/rating',description:'Все серверы: поддержка за Coins, ближайшие открытия и голоса игроков. Прогноз позиции при поддержке.'})
 const support=[...servers].sort(supportOrder),people=[...servers].sort(peopleOrder),openings=servers.filter(s=>s.launch&&Date.parse(s.launch.at)>Date.now()).sort((a,b)=>Date.parse(a.launch!.at)-Date.parse(b.launch!.at)||a.id.localeCompare(b.id))
 return <div className="pb-16"><Container className="pt-6 lg:pt-8">
  <h1 className="text-[26px] leading-tight sm:text-[30px]">Рейтинги серверов{world?` ${world.shortName}`:''}</h1>
  <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-ink-300">Все серверы, включая нулевые показатели. Поддержка за Coins и голоса игроков считаются отдельно.</p><a href="#support-studio" className="gs-support-login inline-flex min-h-11 items-center gap-2 text-sm"><WorldIcon name="coins"/>Рассчитать позицию →</a></div>
  {!world&&<div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto"><ChipToggle active={gameId==='all'} onClick={()=>setGameId('all')}>Все игры</ChipToggle>{GAMES.filter(g=>['lineage2','minecraft','gtarp'].includes(g.id)).map(g=><ChipToggle key={g.id} active={gameId===g.id} onClick={()=>setGameId(g.id)}>{g.shortName}</ChipToggle>)}</div>}
  {error?<Notice tone="warn" className="mt-6">Не удалось обновить рейтинг. Прогноз временно недоступен. <button onClick={reload}>Повторить</button></Notice>:loading&&!servers.length?<p className="mt-6">Загрузка…</p>:<>
   <div className="gs-rating-columns gs-rating-full mt-6 grid gap-4 lg:grid-cols-3">
    <RankPanel title="Лидеры поддержки" hint={`Поддержка за Coins · ${support.length} серверов`} icon={<WorldIcon name="coins"/>}><div className="gs-rating-list" tabIndex={0} role="region" aria-label="Все серверы по поддержке">{support.length?support.map((s,i)=><ServerRow key={s.id} server={s} rank={i+1} metric="support" compact showGame={!world}/>):<ShelfNote title="Серверов пока нет" text="Проекты появятся после публикации в каталоге."/>}</div></RankPanel>
    <RankPanel title="Скоро открытие" hint="Ближайшая дата сначала" icon={<WorldIcon name="opening"/>}><div className="gs-rating-list" tabIndex={0} role="region" aria-label="Все ближайшие открытия">{openings.length?openings.map(s=><ServerRow key={s.id} server={s} compact showGame={!world}/>):<ShelfNote title="Ближайших открытий нет" text="Здесь появятся проекты с объявленной датой запуска."/>}</div></RankPanel>
    <RankPanel title="Выбор игроков" hint={`Голоса игроков · ${people.length} серверов`} icon={<WorldIcon name="vote"/>}><div className="gs-rating-list" tabIndex={0} role="region" aria-label="Все серверы по голосам">{people.length?people.map((s,i)=><ServerRow key={s.id} server={s} rank={i+1} metric="votes" compact showGame={!world}/>):<ShelfNote title="Серверов пока нет" text="Проекты появятся после публикации в каталоге."/>}</div></RankPanel>
   </div>
   {servers.length>0&&<SupportStudio key={`${selected}-${demo}-${params.get('server')??''}`} servers={servers} demo={demo} initialServer={params.get('server')} onSupported={supported}/>}
  </>}
 </Container></div>
}
