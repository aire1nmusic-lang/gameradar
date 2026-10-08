import { useVisualDemo } from '@/hooks/useVisualDemo'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { GAMES } from '@/data/games'
import { useAsync } from '@/hooks/data'
import { discoveryServers, invalidateDiscoveryCache } from '@/services/catalogService'
import { peopleOrder } from '@/services/supportProjection'
import { useSupportRotation } from '@/hooks/useSupportRotation'
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
 const location=useLocation(),dialog=useRef<HTMLDialogElement>(null)
 const [supportOpen,setSupportOpen]=useState(location.hash==='#support-studio'),[category,setCategory]=useState(params.get('all')==='people'?'people':'support')
 useEffect(()=>{setCategory(params.get('all')==='people'?'people':'support')},[params])
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set())
 const more=(id:string,count:number)=>count>5?<button type="button" className="gs-list-more" aria-expanded={expanded.has(id)} onClick={()=>setExpanded(previous=>{const next=new Set(previous);next.has(id)?next.delete(id):next.add(id);return next})}>{expanded.has(id)?'Свернуть':'Показать ещё'}</button>:null
 const selected=world?.id??gameId
 const contextKey=`${selected}-${demo}`
 const {data:result,loading,error,reload}=useAsync(async()=>({contextKey,servers:await discoveryServers({gameId:selected==='all'?undefined:selected},demo)}),[selected,demo],true)
 const servers=result?.contextKey===contextKey?result.servers:[]
 const supportAvailable=!servers.some(s=>s.rankingAvailability?.support===false)
 useEffect(()=>{if(location.hash==='#support-studio')setSupportOpen(true)},[location.hash])

 function closeSupport(){dialog.current?.close();setSupportOpen(false);if(window.location.hash==='#support-studio')history.replaceState(null,'',window.location.pathname+window.location.search)}
 useEffect(()=>{const timer=window.setInterval(()=>{if(document.visibilityState==='visible')reload()},30000);return()=>clearInterval(timer)},[reload])
 const supported=()=>{invalidateDiscoveryCache();reload()}
 useSeo({title:'Рейтинг серверов',path:'/rating',description:'Все серверы: поддержка за Coins, ближайшие открытия и голоса игроков. Прогноз позиции при поддержке.'})
 const support=useSupportRotation(servers,world?.id==='lineage2'),people=[...servers].sort(peopleOrder),openings=servers.filter(s=>s.launch&&Date.parse(s.launch.at)>Date.now()).sort((a,b)=>Date.parse(a.launch!.at)-Date.parse(b.launch!.at)||a.id.localeCompare(b.id))
 return <div className="gs-rating-page pb-16"><Container className="pt-6 lg:pt-8">
  <h1 className="text-[26px] leading-tight sm:text-[30px]">Рейтинг{world?` · ${world.shortName}`:''}</h1>
  <div className="gs-rating-tools"><div className="gs-rating-switch" aria-label="Категория рейтинга">{[['support','Поддержка'],['opening','Открытия'],['people','Голоса']].map(([id,label])=><button key={id} type="button" aria-pressed={category===id} onClick={()=>setCategory(id)}>{label}</button>)}</div><button type="button" className="gs-support-launch" disabled={!supportAvailable} onClick={()=>setSupportOpen(true)}><WorldIcon name="coins" size={17}/>Поддержать сервер</button><details className="gs-rating-about"><summary>Как считается</summary><p>Все серверы, включая нулевые показатели. Coins учитываются в поддержке, голоса игроков — отдельно. Место может измениться.</p></details></div>
  {!world&&<div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto"><ChipToggle active={gameId==='all'} onClick={()=>setGameId('all')}>Все игры</ChipToggle>{GAMES.filter(g=>['lineage2','minecraft','gtarp'].includes(g.id)).map(g=><ChipToggle key={g.id} active={gameId===g.id} onClick={()=>setGameId(g.id)}>{g.shortName}</ChipToggle>)}</div>}
  {error?<Notice tone="warn" className="mt-6">Не удалось обновить рейтинг. Прогноз временно недоступен. <button onClick={reload}>Повторить</button></Notice>:loading&&!servers.length?<p className="mt-6">Загрузка…</p>:<>
   {servers.some(s=>s.rankingAvailability && (!s.rankingAvailability.votes || !s.rankingAvailability.support)) && <p className="gs-ranking-availability" role="status">Рейтинги временно обновляются. Показаны последние доступные данные каталога.</p>}
   <div className="gs-rating-columns gs-rating-full mt-3 grid gap-3 lg:grid-cols-3" data-active={category}>
    <RankPanel className="gs-rating-support" title="Лидеры поддержки" hint={`Поддержка за Coins · ${support.length} серверов`} icon={<WorldIcon name="coins"/>}><div className={'gs-rating-list '+(expanded.has('support')?'gs-rating-expanded':'gs-rating-preview')} tabIndex={0} role="region" aria-label="Все серверы по поддержке">{support.length?support.map((s,i)=><ServerRow key={s.id} server={s} rank={i+1} metric="support" className={i>=10?'gs-list-overflow-desktop gs-list-overflow-phone':i>=5?'gs-list-overflow-phone':undefined} compact showGame={!world}/>):<ShelfNote title="Серверов пока нет" text="Проекты появятся после публикации в каталоге."/>}</div>{more('support',support.length)}</RankPanel>
    <RankPanel className="gs-rating-opening" title="Скоро открытие" hint="Ближайшая дата сначала" icon={<WorldIcon name="opening"/>}><div className={'gs-rating-list '+(expanded.has('opening')?'gs-rating-expanded':'gs-rating-preview')} tabIndex={0} role="region" aria-label="Все ближайшие открытия">{openings.length?openings.map((s,i)=><ServerRow key={s.id} server={s} className={i>=10?'gs-list-overflow-desktop gs-list-overflow-phone':i>=5?'gs-list-overflow-phone':undefined} compact showGame={!world}/>):<ShelfNote title="Ближайших открытий нет" text="Здесь появятся проекты с объявленной датой запуска."/>}</div>{more('opening',openings.length)}</RankPanel>
    <RankPanel className="gs-rating-people" title="Выбор игроков" hint={`Голоса игроков · ${people.length} серверов`} icon={<WorldIcon name="vote"/>}><div className={'gs-rating-list '+(expanded.has('people')?'gs-rating-expanded':'gs-rating-preview')} tabIndex={0} role="region" aria-label="Все серверы по голосам">{people.length?people.map((s,i)=><ServerRow key={s.id} server={s} rank={i+1} metric="votes" className={i>=10?'gs-list-overflow-desktop gs-list-overflow-phone':i>=5?'gs-list-overflow-phone':undefined} compact showGame={!world}/>):<ShelfNote title="Серверов пока нет" text="Проекты появятся после публикации в каталоге."/>}</div>{more('people',people.length)}</RankPanel>
   </div>
   {supportOpen&&supportAvailable&&servers.length>0&&<dialog ref={node=>{dialog.current=node;if(node&&!node.open)node.showModal()}} className="gs-support-dialog" aria-label="Поддержать сервер" onCancel={e=>{e.preventDefault();closeSupport()}} onClick={e=>{if(e.target===dialog.current)closeSupport()}}><div className="gs-support-dialog-head"><strong>Поддержка сервера</strong><button type="button" aria-label="Закрыть поддержку" onClick={closeSupport}><WorldIcon name="close"/></button></div><SupportStudio key={`${selected}-${demo}-${params.get('server')??''}`} servers={servers} demo={demo} initialServer={params.get('server')} onSupported={supported}/></dialog>}
  </>}
 </Container></div>
}
