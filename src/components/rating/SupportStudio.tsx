import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GameServer } from '@/models'
import { getGame } from '@/data/games'
import { useAuth } from '@/hooks/useAuth'
import { projectSupport } from '@/services/supportProjection'
import { SupportPanel } from '@/components/profile/SupportPanel'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { WorldIcon } from '@/components/icons/WorldIcon'
import { Minus, Plus, ChevronDown, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import './support-studio.css'
import './support-dialog-v2.css'
import { ServerPicker } from './ServerPicker'

export function SupportStudio({servers,demo,initialServer,onSupported,onOpenServer}:{servers:GameServer[];demo:boolean;initialServer?:string|null;onSupported:()=>void;onOpenServer?:()=>void}) {
 const choices=[...servers].sort((a,b)=>a.name.localeCompare(b.name,'ru'))
 const [serverId,setServerId]=useState(choices.find(s=>s.id===initialServer||s.slug===initialServer)?.id??choices[0]?.id??'')
 const [amount,setAmount]=useState(10)
 const [expanded,setExpanded]=useState(false)
 const amountId=useId(),listId=useId()
 const target=servers.find(s=>s.id===serverId)
 const projection=projectSupport(servers,serverId,amount)
 const targetIndex=projection?.rows.findIndex(s=>s.id===serverId)??0
 const previewOffset=projection?Math.max(0,Math.min(targetIndex-1,projection.rows.length-3)):0
 const previewRows=projection?(expanded?projection.rows:projection.rows.slice(previewOffset,previewOffset+3)):[]
 const previewStart=(projection?.start??0)+(expanded?0:previewOffset)
 const changeAmount=(delta:number)=>setAmount(value=>Math.min(10000,Math.max(1,(Number.isFinite(value)?Math.trunc(value):0)+delta)))
 const auth=useAuth(),list=useRef<HTMLDivElement>(null),positions=useRef(new Map<string,{top:number;index:number}>())
 useLayoutEffect(()=>{
  const next=new Map<string,{top:number;index:number}>()
  for(const [index,row] of Array.from(list.current?.querySelectorAll<HTMLElement>('[data-preview-id]')??[]).entries()){
   row.getAnimations().forEach(animation=>animation.cancel())
   // List-local coordinates ignore dialog centering, scrolling and form resizing.
   const id=row.dataset.previewId!,top=row.offsetTop,old=positions.current.get(id)
   if(old&&old.index!==index&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&Math.abs(old.top-top)>1) row.animate([{transform:`translateY(${old.top-top}px)`},{transform:'translateY(0)'}],{duration:350,easing:'cubic-bezier(.2,.8,.2,1)'})
   next.set(id,{top,index})
  }
  positions.current=next
 },[serverId,amount,servers,expanded])
 if(!target)return null
 return <section id="support-studio" className="gs-support-studio" aria-label="Поддержка сервера">
  <div className="gs-support-form gs-panel p-4 sm:p-6 min-w-0">
   <div className="gs-support-target">
    <ServerLogo name={target.name} src={target.logoUrl} hue={target.hue} gameId={target.gameId} size="lg" forceGameGlyph className="gs-support-target-avatar"/>
    <div className="gs-support-target-copy">
     <span className="gs-support-eyebrow">Выбранный сервер</span>
     <ServerPicker servers={choices} value={serverId} onChange={id=>{setServerId(id);setExpanded(false)}}/>
     <span className="gs-support-target-meta">{getGame(target.gameId).shortName} · {target.version}{target.rates?` · ${target.rates}`:''}</span>
     {/* Choosing a server here can also mean "show me this server": one tap to its page. */}
     <Link className="gs-support-open-server" to={`/server/${target.slug}`} data-full-page onClick={onOpenServer}>Открыть страницу сервера<ArrowUpRight size={15} aria-hidden="true"/></Link>
    </div>
   </div>
   <div className="gs-support-amount-section">
    <label htmlFor={amountId} className="gs-support-eyebrow">Количество Coins</label>
    <div className="gs-support-stepper">
     <button type="button" aria-label="Уменьшить количество Coins" disabled={amount<=1} onClick={()=>changeAmount(-1)}><Minus size={18}/></button>
     <div className="gs-support-value"><input id={amountId} aria-label="Количество Coins" className="gs-support-amount" type="number" min={1} max={10000} step={1} value={Number.isNaN(amount)?'':amount} onChange={e=>setAmount(e.target.value===''?NaN:Number(e.target.value))}/><span>GS Coins</span></div>
     <button type="button" aria-label="Увеличить количество Coins" disabled={amount>=10000} onClick={()=>changeAmount(1)}><Plus size={18}/></button>
    </div>
    <p className="gs-support-rubles" aria-live="polite">Эквивалент по номиналу: <strong>{Number.isFinite(amount)&&amount>0?`${(amount*50).toLocaleString('ru-RU')} ₽`:'—'}</strong><small>1 GS Coin = 50 ₽ · поддержка списывается с баланса Coins</small></p>
    <div className="gs-support-presets" aria-label="Быстрый выбор Coins">{[5,10,25,50,100].map(n=><button className="gs-amount-preset" key={n} type="button" aria-label={String(n)} aria-pressed={amount===n} onClick={()=>setAmount(n)}>{n}</button>)}</div>
   </div>
  </div>
  <aside className="gs-panel gs-support-preview p-4 sm:p-5" aria-label="Прогноз позиции">
   <div className="gs-support-preview-head"><div><span className="gs-support-eyebrow">После поддержки</span><h3>Прогноз позиции</h3></div><ArrowUpRight size={20} aria-hidden="true"/></div>
   {projection?<>
    <div className="gs-position-summary my-4" aria-live="polite" aria-atomic="true"><div><span>Сейчас</span><strong>#{projection.current}</strong></div><WorldIcon name="chevronRight"/><div><span>После поддержки</span><strong key={`${projection.first}-${projection.last}`} className="gs-position-next">#{projection.first}{projection.last!==projection.first?`–${projection.last}`:''}</strong></div></div>
    <div id={listId} className="gs-projection-list" ref={list}>{previewRows.map((s,i)=><div key={s.id} data-preview-id={s.id} className={`gs-projection-row ${s.id===target.id?'gs-projection-target':''}`}><span className="gs-projection-rank" aria-label={`Место ${previewStart+i+1}`}>{previewStart+i+1}</span><ServerLogo name={s.name} src={s.logoUrl} hue={s.hue} gameId={s.gameId} size="sm" forceGameGlyph/><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{s.name}</strong><span className="gs-projection-coins">{s.id===target.id?`${target.support?.coins??0} → ${projection.total}`:s.support?.coins??0} Coins</span></div>{s.id===target.id&&<CheckCircle2 className="gs-projection-selected" size={18} aria-label="Выбранный сервер"/>}</div>)}<div className="gs-position-track" aria-hidden><span style={{top:`${projection.count<=1?0:(projection.position-1)/(projection.count-1)*100}%`}}/></div></div>
    {projection.rows.length>3&&<button type="button" className="gs-support-more" aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpanded(value=>!value)}>{expanded?'Свернуть список':'Ещё позиции'}<ChevronDown size={14} aria-hidden="true"/></button>}
    <p className="gs-support-estimate-note">Расчёт по текущему рейтингу</p>
   </>:<p role="alert" className="mt-5 text-sm">Введите целое число от 1 до 10 000 Coins.</p>}
  </aside>
  <div className="gs-support-checkout">
   {demo?<p role="status" className="mt-4 rounded-lg border border-promo-400/40 p-3 text-sm">Демо расчёта: примерные показатели. Для настоящей поддержки сначала выключите демо визуала.</p>:!auth.user?<Link className="gs-support-login mt-4 inline-flex min-h-11 items-center" to="/account">Войти для поддержки →</Link>:<div className="mt-5"><SupportPanel key={target.id} server={target} amount={amount} onSupported={onSupported}/></div>}
   <Link to="/terms" className="mt-4 inline-flex min-h-11 items-center text-sm underline">Условия использования GS Coins</Link>
  </div>
 </section>
}

