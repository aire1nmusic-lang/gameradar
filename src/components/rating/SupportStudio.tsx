import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GameServer } from '@/models'
import { getGame } from '@/data/games'
import { useAuth } from '@/hooks/useAuth'
import { projectSupport } from '@/services/supportProjection'
import { SupportPanel } from '@/components/profile/SupportPanel'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { RankMedal } from '@/components/ui/RankMedal'
import { WorldIcon } from '@/components/icons/WorldIcon'

export function SupportStudio({servers,demo,initialServer,onSupported}:{servers:GameServer[];demo:boolean;initialServer?:string|null;onSupported:()=>void}) {
 const choices=[...servers].sort((a,b)=>a.name.localeCompare(b.name,'ru'))
 const [serverId,setServerId]=useState(choices.find(s=>s.id===initialServer||s.slug===initialServer)?.id??choices[0]?.id??'')
 const [amount,setAmount]=useState(10)
 const target=servers.find(s=>s.id===serverId)
 const projection=projectSupport(servers,serverId,amount)
 const auth=useAuth(),list=useRef<HTMLDivElement>(null),positions=useRef(new Map<string,number>())
 useLayoutEffect(()=>{
  const next=new Map<string,number>()
  for(const row of Array.from(list.current?.querySelectorAll<HTMLElement>('[data-preview-id]')??[])){
   const id=row.dataset.previewId!,top=row.getBoundingClientRect().top,old=positions.current.get(id)
   if(old!==undefined&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&Math.abs(old-top)>1) row.animate([{transform:`translateY(${old-top}px)`},{transform:'translateY(0)'}],{duration:350,easing:'cubic-bezier(.2,.8,.2,1)'})
   next.set(id,top)
  }
  positions.current=next
 },[serverId,amount,servers])
 if(!target)return null
 return <section id="support-studio" className="gs-support-studio" aria-label="Поддержка сервера">
  <div className="gs-support-form gs-panel p-4 sm:p-6 min-w-0">


   <label className="mt-5 block text-sm">Сервер<select className="gs-support-select mt-2" value={serverId} onChange={e=>setServerId(e.target.value)}>{choices.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label className="mt-4 block text-sm">Количество Coins<input className="gs-support-amount mt-2" type="number" min={1} max={10000} step={1} value={Number.isNaN(amount)?'':amount} onChange={e=>setAmount(e.target.value===''?NaN:Number(e.target.value))}/></label>
   <div className="mt-3 flex flex-wrap gap-2" aria-label="Быстрый выбор Coins">{[5,10,25,50,100].map(n=><button className="gs-amount-preset" key={n} type="button" aria-pressed={amount===n} onClick={()=>setAmount(n)}>{n}</button>)}</div>


  </div>
  <aside className="gs-panel gs-support-preview p-4 sm:p-5" aria-label="Прогноз позиции">
   <h3 className="font-semibold">Прогноз позиции</h3><p className="mt-1 text-xs text-ink-400">{getGame(target.gameId).shortName} · Поддержка за Coins</p>
   {projection?<>
    <div className="gs-position-summary my-4" aria-live="polite" aria-atomic="true"><div><span>Сейчас</span><strong>#{projection.current}</strong></div><WorldIcon name="chevronRight"/><div><span>После поддержки</span><strong key={`${projection.first}-${projection.last}`} className="gs-position-next">#{projection.first}{projection.last!==projection.first?`–${projection.last}`:''}</strong></div></div>
    <div className="gs-projection-list" ref={list}>{projection.rows.map((s,i)=><div key={s.id} data-preview-id={s.id} className={`gs-projection-row ${s.id===target.id?'gs-projection-target':''}`}><RankMedal rank={projection.start+i+1}/><ServerLogo name={s.name} src={s.logoUrl} hue={s.hue} gameId={s.gameId} size="sm" forceGameGlyph/><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{s.name}</strong><span className="text-xs text-ink-400">{s.id===target.id?`${target.support?.coins??0} → ${projection.total}`:s.support?.coins??0} Coins</span></div>{s.id===target.id&&<WorldIcon name="support" size={18}/>}</div>)}<div className="gs-position-track" aria-hidden><span style={{top:`${projection.count<=1?0:(projection.position-1)/(projection.count-1)*100}%`}}/></div></div>
   </>:<p role="alert" className="mt-5 text-sm">Введите целое число от 1 до 10 000 Coins.</p>}
  </aside>
  <div className="gs-support-checkout">
   {demo?<p role="status" className="mt-4 rounded-lg border border-promo-400/40 p-3 text-sm">Демо расчёта: примерные показатели. Для настоящей поддержки сначала выключите демо визуала.</p>:!auth.user?<Link className="gs-support-login mt-4 inline-flex min-h-11 items-center" to="/account">Войти для поддержки →</Link>:<div className="mt-5"><SupportPanel key={target.id} server={target} amount={amount} onSupported={onSupported}/></div>}
   <Link to="/terms" className="mt-4 inline-flex min-h-11 items-center text-sm underline">Условия использования GS Coins</Link>
  </div>
 </section>
}
