import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared viewport-bound smoky list, also used by searchable server choices. */
export function FloatingListbox({anchor,id,label,children,onDismiss,className}:{anchor:RefObject<HTMLElement|null>;id:string;label:string;children:ReactNode;onDismiss:()=>void;className?:string}) {
 const panel=useRef<HTMLDivElement>(null),dismiss=useRef(onDismiss)
 dismiss.current=onDismiss
 const [position,setPosition]=useState({left:0,top:0,width:0,maxHeight:320})
 useLayoutEffect(()=>{
  const update=()=>{
   const e=anchor.current;if(!e)return
   const r=e.getBoundingClientRect(),v=window.visualViewport
   const leftEdge=v?.offsetLeft??0,topEdge=v?.offsetTop??0,w=v?.width??innerWidth,h=v?.height??innerHeight
   const bottom=topEdge+h-12,above=r.top-topEdge-20,below=bottom-r.bottom-8
   const up=below<Math.min(240,above),maxHeight=Math.max(44,Math.min(320,up?above:below))
   const width=Math.min(Math.max(r.width,230),w-24)
   if(r.bottom<topEdge||r.top>bottom){dismiss.current();return}
   const desired=panel.current?.scrollHeight??maxHeight,height=Math.min(desired,maxHeight)
   setPosition({left:Math.max(leftEdge+12,Math.min(r.left,leftEdge+w-width-12)),top:up?Math.max(topEdge+12,r.top-height-8):r.bottom+8,width,maxHeight})
  }
  update();const frame=requestAnimationFrame(update)
  const observer=new ResizeObserver(update);if(panel.current)observer.observe(panel.current)
  window.addEventListener('resize',update);window.addEventListener('scroll',update,true)
  window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update)
  return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update)}
 },[anchor])
 useEffect(()=>{
  const outside=(event:Event)=>{if(!anchor.current?.contains(event.target as Node)&&!panel.current?.contains(event.target as Node))dismiss.current()}
  document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside)
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside)}
 },[anchor])
 return createPortal(<div ref={panel} id={id} role="listbox" aria-label={label} className={cn('gs-select-options',className)} style={{position:'fixed',zIndex:150,...position,visibility:position.width?'visible':'hidden'}}>{children}</div>,document.body)
}

/** Shared custom select: no native Android/iOS popup, no clipping inside forms/sheets. */
export function SelectMenu({value,onChange,options,label='Сортировка',className,disabled=false,required=false}:{value:string;onChange:(value:string)=>void;options:{value:string;label:string}[];label?:string;className?:string;disabled?:boolean;required?:boolean}) {
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1)
 const trigger=useRef<HTMLButtonElement>(null),id=useId(),typed=useRef({text:'',at:0})
 const selected=options.findIndex(o=>o.value===value)
 const close=()=>setOpen(false)
 const choose=(index:number)=>{if(!options[index])return;onChange(options[index].value);setOpen(false);trigger.current?.focus()}
 useEffect(()=>{if(disabled)setOpen(false)},[disabled])
 useEffect(()=>{if(open&&active>=0)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'})},[open,active,id])
 return <div className={cn('gs-select-menu',className)} onKeyDown={e=>{
  if(disabled)return
  if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close();trigger.current?.focus();return}
  if(e.key==='Tab'){close();return}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();setOpen(true);setActive(i=>e.key==='Home'?0:e.key==='End'?options.length-1:!open?(selected>=0?selected:e.key==='ArrowUp'?options.length-1:0):(i+(e.key==='ArrowUp'?-1:1)+options.length)%options.length);return}
  if(e.key==='Enter'||e.key===' '){e.preventDefault();if(open)choose(active);else{setActive(selected>=0?selected:0);setOpen(true)}return}
  if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const now=Date.now();typed.current={text:(now-typed.current.at<650?typed.current.text:'')+e.key.toLocaleLowerCase('ru'),at:now};const index=options.findIndex(o=>o.label.toLocaleLowerCase('ru').startsWith(typed.current.text));if(index>=0){e.preventDefault();setActive(index);setOpen(true)}}
 }}>
 <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-required={required||undefined} aria-expanded={open} aria-controls={id} aria-activedescendant={open&&active>=0?`${id}-${active}`:undefined} disabled={disabled||!options.length} data-value={value} onClick={()=>{setActive(selected>=0?selected:0);setOpen(!open)}}><span>{options[selected]?.label??'Выберите вариант'}</span><ChevronDown size={16} aria-hidden/></button>
 {open&&<FloatingListbox anchor={trigger} id={id} label={label} onDismiss={close}>{options.map((o,index)=><button type="button" role="option" tabIndex={-1} id={`${id}-${index}`} aria-selected={value===o.value} data-active={index===active} key={o.value} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(index)}><span>{o.label}</span>{value===o.value&&<Check size={16} aria-hidden/>}</button>)}</FloatingListbox>}
 </div>
}
