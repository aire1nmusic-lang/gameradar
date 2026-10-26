import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { GameServer } from '@/models'

/** Searchable server choice. Selection changes only the local support forecast. */
export function ServerPicker({servers,value,onChange}:{servers:GameServer[];value:string;onChange:(id:string)=>void}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState('')
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null),id=useId()
 const choices=servers.filter(s=>`${s.name} ${s.version}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')))
 const close=()=>{setOpen(false);trigger.current?.focus()}
 useEffect(()=>{if(!open)return;search.current?.focus();const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[open])
 return <div className="gs-server-picker" ref={root} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}
  if(open&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const options=[...root.current!.querySelectorAll<HTMLButtonElement>('[role=option]')];const index=options.indexOf(document.activeElement as HTMLButtonElement);options[(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus()}
 }}>
  <button type="button" ref={trigger} aria-label="Сервер" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} data-value={value} onClick={()=>{setQuery('');setOpen(!open)}}>{servers.find(s=>s.id===value)?.name}<ChevronDown size={16}/></button>
  {open&&<div className="gs-server-picker-popover"><label className="gs-server-picker-search"><Search size={16}/><input ref={search} value={query} onChange={e=>setQuery(e.target.value)} aria-label="Поиск сервера для поддержки" placeholder="Название или версия сервера"/></label><div id={id} role="listbox" aria-label="Серверы для поддержки">{choices.map(s=><button type="button" role="option" aria-selected={s.id===value} key={s.id} onClick={()=>{onChange(s.id);close()}}><span><strong>{s.name}</strong><small>{s.version}{s.rates?` · ${s.rates}`:''}</small></span><span>{s.support?.coins??0} Coins</span>{s.id===value&&<Check size={16}/>}</button>)}{!choices.length&&<p role="status">Сервер не найден. Попробуйте другое название.</p>}</div></div>}
 </div>
}
