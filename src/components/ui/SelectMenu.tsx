import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A themed, keyboard-operable menu instead of the platform's grey select popup. */
export function SelectMenu({value,onChange,options,label='Сортировка',className}:{value:string;onChange:(value:string)=>void;options:{value:string;label:string}[];label?:string;className?:string}) {
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open])
 return <div ref={root} className={cn('gs-select-menu',className)} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus()}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();setOpen(true);requestAnimationFrame(()=>{const buttons=[...root.current!.querySelectorAll<HTMLButtonElement>('[role=option]')];const i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus()})}}}>
 <button ref={trigger} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={()=>setOpen(!open)}>{options.find(o=>o.value===value)?.label}<ChevronDown size={15}/></button>
 {open&&<div role="listbox" aria-label={label}>{options.map(o=><button type="button" role="option" aria-selected={value===o.value} key={o.value} onClick={()=>{onChange(o.value);setOpen(false);trigger.current?.focus()}}>{o.label}{value===o.value&&<Check size={14}/>}</button>)}</div>}
 </div>
}
