import { useEffect, useState } from 'react'
import { ChevronDown, ArrowLeft, Check, Search } from 'lucide-react'
import { repo } from '@/repositories'
import { searchServers } from '@/services/catalogService'
import type { GameServer } from '@/models'
import { apiRequest, apiSend } from '@/repositories/http/client'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/controls'
import { Modal } from '@/components/ui/overlays'
import { ClaimProof } from './ClaimProof'

export type OwnershipClaim={id:string;server_id:string;status:string;access_active?:boolean;reason?:string;name?:string;proof_method?:string}
type IssuedProof={claimId:string;code:string;method:string;target:string;expiresAt:string}
type Options={available:boolean;attachments:boolean;maxFiles:number;maxFileBytes:number}
type MethodKey='SITE'|'DNS'|'MANUAL'|'DOCUMENT'
const methods:{value:MethodKey;label:string;subtitle:string}[]=[
  {value:'SITE',label:'Файл на официальном сайте',subtitle:'Если у вас есть доступ к файлам сайта'},
  {value:'DNS',label:'DNS-запись домена',subtitle:'Если вы управляете настройками домена'},
  {value:'MANUAL',label:'Код на официальном ресурсе',subtitle:'Сайт, Discord или Telegram проекта'},
  {value:'DOCUMENT',label:'Документ или скриншот доступа',subtitle:'Ручная проверка администратора'},
]
const guides:Record<MethodKey,{needs:string;steps:string[];note:string}>={
  SITE:{
    needs:'Доступ к файлам официального сайта вашего игрового сервера (хостинг, FTP или файловый менеджер). Домен — адрес этого сайта, например myserver.ru, а не ID сервера.',
    steps:['Выберите сервер и отправьте заявку. GameScout выдаст уникальный код и точный адрес файла.','Создайте по указанному пути обычный текстовый файл на вашем сайте и поместите в него только код.','Вернитесь в заявку и нажмите «Проверить размещение кода».'],
    note:'Это подтверждает управление сайтом, связанным с проектом, но не является автоматическим доказательством юридического владения игровым сервером.',
  },
  DNS:{
    needs:'Доступ к панели DNS официального домена проекта, например в личном кабинете регистратора домена или DNS-хостинга.',
    steps:['После отправки заявки получите имя TXT-записи и уникальный код.','Откройте настройки DNS вашего домена, создайте TXT-запись с выданным именем и значением кода.','После распространения DNS-записи запустите проверку из заявки.'],
    note:'Изменения DNS могут появиться не сразу. Не меняйте существующие записи сайта; добавьте отдельную TXT-запись.',
  },
  MANUAL:{
    needs:'Доступ к официальному сайту, каналу Telegram или Discord-серверу проекта, который можно связать с выбранным игровым сервером.',
    steps:['Укажите прямую ссылку на официальный ресурс в форме.','После отправки GameScout выдаст код. Разместите его в публичной записи или на странице ресурса.','Администратор вручную проверит связь ресурса с сервером и размещение кода.'],
    note:'Нужна именно ссылка на опубликованный материал; личные сообщения и скриншот без публичной ссылки могут не подойти.',
  },
  DOCUMENT:{
    needs:'Подтверждение управления проектом: скриншот панели хостинга или регистратора, договор с названием проекта либо аналогичный документ.',
    steps:['Выберите сервер и подготовьте PDF, JPG или PNG — до 3 файлов по 1 МБ каждый.','Скройте пароли, токены, паспортные данные, банковские реквизиты и другие лишние сведения.','Приложите файлы к заявке: решение принимает администратор вручную.'],
    note:'Документы не публикуются. Этот способ будет доступен только после подключения закрытого сервиса проверки прав.',
  },
}
export function ClaimApplication({claims,emailVerified,onChanged}:{claims:OwnershipClaim[];emailVerified:boolean;onChanged:()=>Promise<void>}) {
  const initial=new URLSearchParams(location.search).get('claim')??''
  const [game,setGame]=useState('lineage2'),[query,setQuery]=useState(''),[selected,setSelected]=useState<GameServer>()
  const [items,setItems]=useState<GameServer[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('')
  const [serverPickerOpen,setServerPickerOpen]=useState(false),[methodPickerOpen,setMethodPickerOpen]=useState(false)
  const [methodDetail,setMethodDetail]=useState<MethodKey|null>(null),[method,setMethod]=useState<MethodKey>('SITE'),[resource,setResource]=useState('')
  const [options,setOptions]=useState<Options>(),[optionsLoading,setOptionsLoading]=useState(true),[files,setFiles]=useState<File[]>([])
  const [proof,setProof]=useState<IssuedProof>()
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  useEffect(()=>{let live=true;apiRequest<Options>('/claims/options').then(value=>{if(live)setOptions(value)}).catch(()=>{}).finally(()=>{if(live)setOptionsLoading(false)});return()=>{live=false}},[])
  useEffect(()=>{let live=true;setSearching(true);setSearchError('')
    const timer=setTimeout(()=>{searchServers({gameId:game,query:query.trim()||undefined,limit:100}).then(page=>{
      if(live)setItems([...page.items].sort((a,b)=>a.name.localeCompare(b.name,'ru',{sensitivity:'base',numeric:true})))
    }).catch(()=>{if(live){setItems([]);setSearchError('Не удалось загрузить серверы. Попробуйте ещё раз.')}}).finally(()=>{if(live)setSearching(false)})},180)
    return()=>{live=false;clearTimeout(timer)}
  },[game,query])
  useEffect(()=>{if(!initial)return;let live=true;repo.servers.byId(initial).then(server=>{if(live&&server){setSelected(server);setGame(server.gameId)}}).catch(()=>{});return()=>{live=false}},[initial])
  const choose=(server:GameServer)=>{setSelected(server);setServerPickerOpen(false);setQuery('')}
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
  return <>
    <details className="gs-account-claim rounded-[18px] border p-4" id="claim-server" open={initial?true:undefined}>
      <summary className="cursor-pointer list-none text-[14px] font-semibold">Подтвердить права на сервер</summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm">Выберите сервер из каталога и способ подтверждения. Решение принимает администратор в течение 3 дней.</p>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Игра"><Select value={game} onChange={value=>{setGame(value);setSelected(undefined);setQuery('');setServerPickerOpen(false)}} options={[{value:'lineage2',label:'Lineage 2'},{value:'minecraft',label:'Minecraft'},{value:'gtarp',label:'GTA RP'}]}/></Field>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Сервер</p>
            <button type="button" className="gs-claim-choice" onClick={()=>{setQuery('');setServerPickerOpen(true)}} aria-haspopup="dialog" aria-label={selected?`Изменить сервер: ${selected.name}`:'Выберите сервер из каталога'}>
              <span className={selected?'gs-claim-choice-value':'gs-claim-choice-placeholder'}>{selected?.name??'Выберите сервер из списка'}</span>
              <Search size={19} aria-hidden="true"/>
            </button>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Способ подтверждения</p>
            <button type="button" className="gs-claim-choice" onClick={()=>{setMethodDetail(null);setMethodPickerOpen(true)}} aria-haspopup="dialog" aria-label="Выбрать способ подтверждения">
              <span className="gs-claim-choice-value">{methods.find(m=>m.value===method)?.label}</span>
              <ChevronDown size={19} aria-hidden="true"/>
            </button>
            <p className="mt-2 text-[12px] opacity-75">Нажмите, чтобы посмотреть варианты и пошаговую инструкцию.</p>
          </div>
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
    <Modal open={serverPickerOpen} onClose={()=>{setServerPickerOpen(false);setQuery('')}} title="Выберите сервер" description="Список выбранной игры. Клавиатура откроется только при нажатии на поиск." width="max-w-lg">
      <div className="gs-claim-server-dialog">
        <label htmlFor="gs-claim-server-search" className="sr-only">Поиск сервера по названию</label>
        <div className="gs-claim-dialog-search"><Search size={18} aria-hidden="true"/><Input id="gs-claim-server-search" type="search" autoComplete="off" placeholder="Начните вводить название…" value={query} onChange={e=>setQuery(e.target.value)} /></div>
        <p className="gs-claim-dialog-caption">{searching?'Загрузка списка…':query?'Найденные серверы':'Серверы по алфавиту'}</p>
        <div className="gs-claim-dialog-list" role="listbox" aria-label="Серверы выбранной игры">
          {searching?<p role="status" className="gs-claim-dialog-message">Ищем серверы…</p>:searchError?<p role="status" className="gs-claim-dialog-message">{searchError}</p>:!items.length?<p className="gs-claim-dialog-message">Таких серверов в каталоге пока нет.</p>:items.map(server=><button key={server.id} type="button" role="option" aria-selected={selected?.id===server.id} className="gs-claim-dialog-row" onClick={()=>choose(server)}><span className="min-w-0"><strong>{server.name}</strong><small>{server.version||server.gameId}</small></span>{selected?.id===server.id&&<Check size={17} aria-hidden="true"/>}</button>)}
        </div>
      </div>
    </Modal>
    <Modal open={methodPickerOpen} onClose={()=>setMethodPickerOpen(false)} title={methodDetail?'Как подтвердить права':'Выберите способ подтверждения'} description={methodDetail?methods.find(m=>m.value===methodDetail)?.label:'Подберите способ по тому, к чему у вас есть доступ.'} width="max-w-lg">
      {methodDetail ? <div className="gs-claim-method-guide">
        <button type="button" className="gs-claim-back" onClick={()=>setMethodDetail(null)}><ArrowLeft size={17}/> Все способы</button>
        <h4>Что потребуется</h4><p>{guides[methodDetail].needs}</p>
        <h4>Как подтвердить</h4><ol>{guides[methodDetail].steps.map((step,index)=><li key={index}>{step}</li>)}</ol>
        <p className="gs-claim-method-note">{guides[methodDetail].note}</p>
        <Button variant="primary" full onClick={()=>{setMethod(methodDetail);setFiles([]);setMethodPickerOpen(false)}}>Выбрать этот способ</Button>
      </div> : <div className="gs-claim-method-list">{methods.map(m=><button key={m.value} type="button" className="gs-claim-method-row" onClick={()=>setMethodDetail(m.value)}><span><strong>{m.label}</strong><small>{m.subtitle}</small></span>{method===m.value&&<Check size={17} aria-hidden="true"/>}<ChevronDown size={17} aria-hidden="true"/></button>)}</div>}
    </Modal>
  </>
}
