import { useEffect, useId, useRef, useState } from 'react'
import { repo } from '@/repositories'
import { searchServers } from '@/services/catalogService'
import type { GameServer } from '@/models'
import { apiRequest, apiSend } from '@/repositories/http/client'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/controls'
import { ClaimProof } from './ClaimProof'

export type OwnershipClaim={id:string;server_id:string;status:string;access_active?:boolean;reason?:string;name?:string;proof_method?:string}
type IssuedProof={claimId:string;code:string;method:string;target:string;expiresAt:string}
type Options={available:boolean;attachments:boolean;maxFiles:number;maxFileBytes:number}
const methods=[{value:'SITE',label:'Файл на официальном сайте'},{value:'DNS',label:'DNS-запись домена'},{value:'MANUAL',label:'Код на официальном ресурсе'},{value:'DOCUMENT',label:'Документ или скриншот доступа'}]
const instructions:Record<string,string>={SITE:'Разместите выданный код в файле на официальном сайте сервера.',DNS:'Добавьте выданный код в TXT-запись домена официального сайта.',MANUAL:'Разместите код на официальном сайте, в Discord или Telegram проекта. Укажите прямую ссылку на публикацию.',DOCUMENT:'Загрузите один из вариантов: подтверждение домена у регистратора, договор хостинга с названием проекта или скриншот панели управления с адресом сервера. Можно приложить до 3 файлов. Закройте пароли, ключи, паспортные данные и платёжные реквизиты.'}
export function ClaimApplication({claims,emailVerified,onChanged}:{claims:OwnershipClaim[];emailVerified:boolean;onChanged:()=>Promise<void>}) {
  const initial=new URLSearchParams(location.search).get('claim')??''
  const [game,setGame]=useState('lineage2'),[query,setQuery]=useState(''),[selected,setSelected]=useState<GameServer>()
  const [items,setItems]=useState<GameServer[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('')
  const [expanded,setExpanded]=useState(false),[active,setActive]=useState(-1),[method,setMethod]=useState('SITE'),[resource,setResource]=useState('')
  const [options,setOptions]=useState<Options>(),[optionsLoading,setOptionsLoading]=useState(true),[files,setFiles]=useState<File[]>([])
  const [proof,setProof]=useState<IssuedProof>()
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const listId=useId(),searchRef=useRef<HTMLInputElement>(null)
  useEffect(()=>{let live=true;apiRequest<Options>('/claims/options').then(value=>{if(live)setOptions(value)}).catch(()=>{}).finally(()=>{if(live)setOptionsLoading(false)});return()=>{live=false}},[])
  useEffect(()=>{let live=true;setSearching(true);setSearchError('');setActive(-1)
    const timer=setTimeout(()=>{searchServers({gameId:game,query:query.trim()||undefined,limit:30}).then(page=>{if(live)setItems(page.items)})
      .catch(()=>{if(live){setItems([]);setSearchError('Не удалось загрузить серверы. Измените запрос или повторите позже.')}}).finally(()=>{if(live)setSearching(false)})},250)
    return()=>{live=false;clearTimeout(timer)}
  },[game,query])
  useEffect(()=>{if(!initial)return;let live=true;repo.servers.byId(initial).then(server=>{if(live&&server){setSelected(server);setGame(server.gameId)}}).catch(()=>{});return()=>{live=false}},[initial])
  const choose=(server:GameServer)=>{setSelected(server);setExpanded(false);setActive(-1);searchRef.current?.focus()}
  async function submit(e:React.FormEvent) {
    e.preventDefault();if(!selected||!options?.available||!emailVerified)return
    if(method==='DOCUMENT'&&!files.length){setError('Приложите хотя бы один файл подтверждения.');return}
    setBusy(true);setError('');setMessage('')
    try {
      const evidence=`Способ: ${methods.find(m=>m.value===method)?.label}. ${resource.trim()?`Официальный ресурс: ${resource.trim()}`:'Подтверждение прав будет предоставлено выбранным способом.'}`
      const claim=await apiSend<OwnershipClaim>('/claims',{serverId:selected.id,evidence})
      for(const file of files) {
        const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
        await apiSend(`/claims/${encodeURIComponent(claim.id)}/attachments`,{name:file.name,mime:file.type,data:btoa(binary)})
      }
      const issued=await apiSend<IssuedProof>(`/claims/${encodeURIComponent(claim.id)}/proof`,{method})
      if(method!=='DOCUMENT')setProof(issued)
      setFiles([]);setMessage(method==='DOCUMENT'?'Документы переданы. Проверка — до 3 дней.':'Заявка сохранена. Разместите выданный код на официальном ресурсе; проверка — до 3 дней.');await onChanged()
    } catch(e){setError(e instanceof Error?e.message:'Не удалось отправить заявку. При повторе уже сохранённая заявка будет продолжена.')}
    finally{setBusy(false)}
  }
  return <details className="gs-account-claim rounded-[18px] border p-4" id="claim-server" open={initial?true:undefined}>
    <summary className="cursor-pointer list-none text-[14px] font-semibold">Подтвердить права на сервер</summary>
    <div className="mt-4 space-y-4">
      <p className="text-sm">Выберите сервер и один способ подтверждения. Заявку проверяет администратор в течение 3 дней; документы не публикуются.</p>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Игра"><Select value={game} onChange={value=>{setGame(value);setSelected(undefined);setQuery('');setExpanded(false)}} options={[{value:'lineage2',label:'Lineage 2'},{value:'minecraft',label:'Minecraft'},{value:'gtarp',label:'GTA RP'}]}/></Field>
        <div className="gs-claim-picker relative">
          <label htmlFor={listId+'-input'} className="mb-1.5 block text-[13px] font-medium">Сервер</label>
          <Input id={listId+'-input'} ref={searchRef} role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={expanded} aria-activedescendant={active>=0?`${listId}-${active}`:undefined} autoComplete="off" placeholder="Название сервера" value={selected?selected.name:query}
            onFocus={()=>setExpanded(true)} onChange={e=>{setSelected(undefined);setQuery(e.target.value);setExpanded(true)}} onBlur={e=>{if(!e.currentTarget.parentElement?.contains(e.relatedTarget))setExpanded(false)}}
            onKeyDown={e=>{if(e.key==='Escape'){setExpanded(false);return}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setExpanded(true);setActive(i=>Math.max(0,Math.min(items.length-1,i+(e.key==='ArrowDown'?1:-1))))}if(e.key==='Enter'&&expanded&&active>=0&&items[active]){e.preventDefault();choose(items[active])}}}/>
          {expanded&&<div className="gs-server-picker-popover absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-auto rounded-xl border p-2" role="listbox" aria-label="Серверы выбранной игры" id={listId}>
            {searching?<p className="p-3 text-sm" role="status">Ищем серверы…</p>:searchError?<p className="p-3 text-sm" role="status">{searchError}</p>:!items.length?<p className="p-3 text-sm">Серверов не найдено</p>:items.map((server,index)=><button key={server.id} type="button" role="option" id={`${listId}-${index}`} aria-selected={selected?.id===server.id||active===index} className="gs-claim-option block min-h-11 w-full rounded-lg p-3 text-left text-sm hover:bg-white/10 aria-selected:bg-white/10" onMouseDown={e=>e.preventDefault()} onClick={()=>choose(server)}>{server.name}<span className="block text-xs opacity-65">{server.version||server.gameId}</span></button>)}
          </div>}
        </div>
        <Field label="Способ подтверждения"><Select value={method} onChange={value=>{setMethod(value);setFiles([])}} options={methods}/></Field>
        <p className="text-sm leading-relaxed">{instructions[method]}</p>
        {method==='MANUAL'&&<Field label="Ссылка на официальный ресурс"><Input type="url" required placeholder="https://" value={resource} onChange={e=>setResource(e.target.value)} maxLength={500}/></Field>}
        {method==='DOCUMENT'&&<Field label="Подтверждающие файлы" hint="PDF, JPG или PNG · до 1 МБ каждый · до 3 файлов">
          <input type="file" multiple accept="application/pdf,image/jpeg,image/png" disabled={!options?.attachments||busy} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border file:border-white/20 file:bg-white/10 file:p-2 file:text-inherit" onChange={e=>{const next=[...e.target.files??[]];if(next.length>3||next.some(f=>f.size>1048576||!['application/pdf','image/jpeg','image/png'].includes(f.type))){setError('Выберите до 3 файлов PDF, JPG или PNG размером до 1 МБ каждый.');e.target.value='';setFiles([])}else{setError('');setFiles(next)}}}/>
          {!!files.length&&<ul className="mt-2 break-words text-xs">{files.map(f=><li key={f.name}>{f.name}</li>)}</ul>}
        </Field>}
        {!optionsLoading&&!options?.available&&<p role="status" className="text-sm">Приём заявок временно недоступен. Отправка и загрузка документов откроются после подключения сервиса проверки прав.</p>}
        {!emailVerified&&<p className="text-sm">Для отправки нужен подтверждённый email. Если вы вошли через Google, выйдите и войдите снова, чтобы получить подтверждённый адрес от Google.</p>}
        <Button type="submit" variant="primary" disabled={busy||!selected||!options?.available||!emailVerified||method==='DOCUMENT'&&!files.length}>{busy?'Сохраняем…':optionsLoading?'Проверяем доступность…':'Отправить на проверку'}</Button>
      </form>
      {error&&<p role="alert" className="text-sm text-danger-300">{error}</p>}{message&&<p role="status" className="text-sm text-signal-400">{message}</p>}
      {proof&&<div className="space-y-3 border-t border-white/15 pt-4">
        <h3 className="text-sm font-semibold">Подтверждение: {methods.find(m=>m.value===proof.method)?.label}</h3>
        <p className="break-all text-sm">{proof.method==='DNS'?'Имя TXT-записи: ':proof.method==='SITE'?'Адрес файла: ':''}{proof.method==='MANUAL'?'Опубликуйте код на указанном официальном ресурсе.':proof.target}</p>
        <code className="block select-all break-all rounded-lg border border-white/15 p-3 text-sm">{proof.code}</code>
        <p className="text-xs">{proof.method==='SITE'?'В файле должна быть только строка кода.':proof.method==='DNS'?'Значение TXT-записи — только строка кода.':'Администратор лично проверит размещение кода.'} Код действует 4 дня.</p>
        {proof.method!=='MANUAL'&&<Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await apiSend(`/claims/${encodeURIComponent(proof.claimId)}/proof/check`,{});setMessage('Код найден. Заявка передана администратору — до 3 дней.');await onChanged()}catch(e){setError(e instanceof Error?e.message:'Не удалось проверить код')}finally{setBusy(false)}}}>Проверить размещение кода</Button>}
      </div>}
      {claims.map(c=><div key={c.id} className="space-y-2 border-t border-white/15 pt-4 text-sm"><p><strong>{c.name??c.server_id}</strong> · {c.status==='PENDING'?'На проверке · до 3 дней':c.status==='REJECTED'?'Отклонено':c.access_active?'Владение подтверждено':'Права владельца сняты'}{c.reason?` · ${c.reason}`:''}</p>{c.status==='PENDING'&&c.proof_method==='DOCUMENT'?<p>Документы переданы администратору.</p>:c.status==='PENDING'&&c.id!==proof?.claimId&&<ClaimProof initialMethod={c.proof_method} id={c.id} onChecked={onChanged}/>}</div>)}
    </div>
  </details>
}
