import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiRequest, apiSend } from '@/repositories/http/client'
import { useSeo } from '@/lib/seo'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'
import { AccountCoins } from '@/components/account/AccountCoins'
import { AccountEntry } from '@/components/account/AccountEntry'
import { ClaimProof } from '@/components/account/ClaimProof'
import { GsMark } from '@/components/layout/Logo'
import { ChevronRight, Copy, Gamepad2, LogOut, Search, Server, Settings, ShieldCheck } from 'lucide-react'

type Claim = { id:string; server_id:string; status:string; access_active?:boolean; reason?:string; evidence?:string; name?:string }
type Owned = {server_id:string;name:string;slug:string;game_id:string}
type SummaryEdit = {id:string;summary:string;status:string;reason?:string;created_at:string}
type FactEdit = {id:string;field:string;value:string;status:string;reason?:string;created_at:string}
type Monitor = {configured?:false;enabled?:boolean;held?:boolean;host?:string|null;port?:number|null;api_url?:string|null;updated_at?:string}
const factLabels:Record<string,string>={version:'Версия',rates:'Рейты',modes:'Режимы',region:'Регион',country:'Страна',openedAt:'Дата открытия',site:'Сайт',discord:'Discord',telegram:'Telegram'}
type Profile = {email?:string;emailVerified?:boolean;permissions?:string[];roles?:string[]}
const providerLabels:Record<string,string>={google:'Google',vk:'VK',yandex:'Яндекс',discord:'Discord'}

export default function Account() {
  useSeo({title:'Аккаунт',path:'/account',noindex:true})
  const auth=useAuth(), profile=auth.user as (typeof auth.user & Profile)
  const [mode,setMode]=useState<'login'|'register'|'reset'>('login')
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState('')
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [linkToken,setLinkToken]=useState(''),[purpose,setPurpose]=useState('')
  const [claims,setClaims]=useState<Claim[]>([]),[owned,setOwned]=useState<Owned[]>([]),[queue,setQueue]=useState<Claim[]>([])
  const [serverId,setServerId]=useState(()=>new URLSearchParams(location.search).get('claim')??'')
  const [evidence,setEvidence]=useState(''),[reasons,setReasons]=useState<Record<string,string>>({})
  const [observedCodes,setObservedCodes]=useState<Record<string,string>>({})
  useEffect(()=>{
    const consumeLink=()=>{
      const params=new URLSearchParams(location.hash.slice(1))
      const token=params.get('token')
      if(!token)return
      setLinkToken(token);setPurpose(params.get('purpose')??'')
      // Remove sensitive fragments before any further navigation; never send them to analytics.
      history.replaceState(null,'',location.pathname+location.search)
    }
    consumeLink()
    window.addEventListener('hashchange',consumeLink)
    return()=>window.removeEventListener('hashchange',consumeLink)
  },[])
  async function reload() {
    await auth.refresh()
    const [c,s]=await Promise.all([apiRequest<Claim[]>('/owners/me/claims'),apiRequest<Owned[]>('/owners/me/servers')])
    setClaims(c);setOwned(s)
    if(profile?.roles?.includes('ADMIN')) setQueue(await apiRequest<Claim[]>('/admin/claims'))
  }
  useEffect(()=>{ if(auth.privateCore&&auth.user) void reload().catch(e=>setError(e.message)) },[auth.privateCore,auth.user?.id])
  async function run(action:()=>Promise<unknown>,success:string) {
    setBusy(true);setError('');setMessage('')
    try { await action();setPassword('');setMessage(success);await auth.refresh() }
    catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить запрос')}
    finally{setBusy(false)}
  }
  async function submit(event:React.FormEvent) {
    event.preventDefault()
    const path=mode==='register'?'/auth/register':mode==='reset'?'/auth/password/reset/request':'/auth/login'
    await run(()=>apiSend(path,{email,password,displayName:name}),mode==='login'?'Вы вошли.':'Проверьте почту. Если адрес подходит для этого действия, придёт ссылка на 20 минут.')
  }
  if(auth.loading) return <main className="mx-auto max-w-2xl p-6">Проверяем сессию…</main>
  if(!auth.privateCore) return <main className="mx-auto max-w-2xl p-6"><Notice tone="info">Новый аккаунт ещё не подключён в этом окружении.</Notice></main>
  if(!auth.user)return <AccountEntry mode={mode} setMode={m=>{setMode(m);setError('');setMessage('')}} email={email} setEmail={setEmail} password={password} setPassword={setPassword} name={name} setName={setName}
    busy={busy} error={error} apiError={auth.error} message={message} registrationOpen={auth.registrationOpen} providers={auth.providers} submit={submit}
    confirmation={linkToken&&<section className="space-y-3 rounded-xl border border-signal-400/20 p-4"><h2>{purpose==='reset'?'Новый пароль':'Подтвердите email'}</h2>
      {purpose==='reset'&&<Field label="Новый пароль — от 12 символов"><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></Field>}
      <Button disabled={busy||(purpose==='reset'&&password.length<12)} onClick={()=>run(async()=>{await apiSend(purpose==='reset'?'/auth/password/reset':purpose==='email'?'/me/email/confirm':'/auth/register/confirm',{token:linkToken,password});setLinkToken('')},purpose==='reset'?'Пароль изменён. Войдите заново.':'Email подтверждён.')}>Подтвердить</Button>
    </section>}/>
  const isAdmin=!!profile?.permissions?.length
  const playerStatus=profile?.roles?.includes('OWNER')?'Игрок и владелец':'Игрок'
  const copyEmail=()=>{if(profile?.email&&navigator.clipboard)void navigator.clipboard.writeText(profile.email)}

  return <main className="gs-account-page gs-account-premium mx-auto w-full max-w-2xl space-y-6 px-4 py-6 sm:py-8">
    <section className="gs-account-hero relative overflow-hidden rounded-[26px] border px-5 py-6 sm:px-7 sm:py-8">
      <div className="relative z-10 max-w-[420px]">
        <p className="gs-account-kicker text-[12px] font-semibold uppercase tracking-[0.16em]">Аккаунт</p>
        <h1 className="mt-1 text-[32px] font-bold leading-[1.05] sm:text-[38px]">GameScout</h1>
        <p className="mt-3 max-w-sm text-[13px] leading-relaxed opacity-70 sm:text-[14px]">Профиль, подключённые сервисы и игровая активность в одном месте.</p>
      </div>
    </section>

    {error&&<p role="alert" className="rounded-xl border border-danger-400/25 bg-danger-500/8 px-4 py-3 text-[13px] text-danger-300">{error}</p>}
    {message&&<p role="status" className="rounded-xl border border-signal-400/20 bg-signal-500/8 px-4 py-3 text-[13px] text-signal-400">{message}</p>}

    {linkToken&&<section className="gs-account-card space-y-3 rounded-[22px] border p-5">
      <h2 className="text-[17px] font-semibold">Подтверждение {purpose==='reset'?'нового пароля':'email'}</h2>
      {purpose==='reset'&&<Field label="Новый пароль — от 12 символов"><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></Field>}
      <Button disabled={busy} onClick={()=>run(async()=>{
        const path=purpose==='reset'?'/auth/password/reset':purpose==='email'?'/me/email/confirm':'/auth/register/confirm'
        await apiSend(path,{token:linkToken,password});setLinkToken('')
      },purpose==='reset'?'Пароль изменён. Войдите заново.':'Email подтверждён.')}>Подтвердить</Button>
    </section>}

    <section className="gs-account-card rounded-[22px] border p-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-4">
        <span className="gs-account-avatar grid h-16 w-16 shrink-0 place-items-center rounded-full border">
          <GsMark height={34} live />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[18px] font-semibold">{auth.user.displayName}</h2>
            <span className="gs-account-status inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"><span className="h-1.5 w-1.5 rounded-full bg-signal-400"/>{playerStatus}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] opacity-68">
            <span className="truncate">{profile?.email??'Email не привязан'}</span>
            {profile?.email&&<button type="button" onClick={copyEmail} aria-label="Скопировать email" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-current/5"><Copy size={13}/></button>}
          </div>
          {profile?.email&&<div className="mt-1 flex items-center gap-1.5 text-[11px] opacity-65">{profile.emailVerified?<><ShieldCheck size={13} className="text-signal-400"/> Email подтверждён</>:<>Email требует подтверждения</>}</div>}
        </div>
      </div>
      {!profile?.email&&<form onSubmit={e=>{e.preventDefault();void run(()=>apiSend('/me/email',{email}),'Ссылка отправлена на почту.')}} className="mt-4 flex gap-2">
        <Input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/>
        <Button type="submit" disabled={busy}>Подтвердить</Button>
      </form>}
    </section>

    {!!auth.providers.length&&<section>
      <h2 className="mb-3 flex items-center justify-between text-[16px] font-semibold"><span>Подключение аккаунтов</span><ChevronRight size={17} className="opacity-55"/></h2>
      <div className="grid grid-cols-2 gap-3">
        {auth.providers.map(p=><button key={p} type="button" onClick={()=>location.assign(`/api/v1/auth/${p}?link=1&next=/account`)} className="gs-provider-tile group flex min-h-[82px] items-center gap-3 rounded-[18px] border p-3 text-left transition-transform active:scale-[.985]">
          <span className="gs-provider-icon grid h-11 w-11 shrink-0 place-items-center rounded-full border text-[18px] font-bold">{p==='google'?<span className="font-sans">G</span>:p==='discord'?<Gamepad2 size={21}/>:providerLabels[p]?.slice(0,1)??p.slice(0,1).toUpperCase()}</span>
          <span className="min-w-0"><strong className="block truncate text-[14px]">{providerLabels[p]??p}</strong><span className="mt-0.5 block text-[11px] opacity-60">Подключить</span></span>
        </button>)}
      </div>
    </section>}

    <section>
      <h2 className="mb-3 text-[16px] font-semibold">Действия с аккаунтом</h2>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={busy} onClick={()=>run(()=>auth.logout(),'Вы вышли.')} className="gs-account-action flex h-14 items-center justify-center gap-2 rounded-[16px] border text-[13px] font-medium disabled:opacity-50"><LogOut size={17}/>Выйти</button>
        {isAdmin?<Button to="/admin" className="gs-admin-action h-14 rounded-[16px] border px-3 text-[13px]" icon={<Settings size={17}/>} iconRight={<ChevronRight size={16}/>}>Админский кабинет</Button>
          :<Button to="/catalog" className="gs-admin-action h-14 rounded-[16px] border px-3 text-[13px]" icon={<Search size={17}/>} iconRight={<ChevronRight size={16}/>}>Найти сервер</Button>}
      </div>
    </section>

    <AccountCoins key={auth.user.id}/>

    <section className="gs-account-servers space-y-3">
      <h2 className="flex items-center justify-between text-[18px] font-semibold"><span>Мои серверы</span><ChevronRight size={18} className="opacity-55"/></h2>
      {!owned.length?<div className="gs-account-empty rounded-[22px] border px-5 py-7 text-center">
        <span className="gs-account-empty-icon mx-auto grid h-14 w-14 place-items-center rounded-full"><Server size={25}/></span>
        <h3 className="mt-4 text-[15px] font-semibold">Подтверждённых серверов пока нет</h3>
        <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed opacity-62">Добавьте сервер, чтобы отслеживать онлайн, рейтинг и получать уведомления.</p>
        <Button to="/catalog" className="gs-find-server mt-5 h-11 min-w-[220px] rounded-xl" icon={<Search size={16}/>} iconRight={<ChevronRight size={16}/>}>Найти серверы</Button>
      </div>:owned.map(s=><div key={s.server_id} className="space-y-3"><OwnerSummary server={s}/><OwnerFacts server={s}/><OwnerMonitoring server={s}/></div>)}

      <details className="gs-account-claim rounded-[18px] border p-4">
        <summary className="cursor-pointer list-none text-[13px] font-semibold">Подтвердить права на сервер</summary>
        <div className="mt-4 space-y-3">
          <p className="text-[12px] opacity-62">Заявку проверяет администратор. Пароли и секреты не присылайте.</p>
          <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{await apiSend('/claims',{serverId,evidence});await reload()},'Заявка передана на проверку.')}}>
            <Field label="ID сервера"><Input required value={serverId} onChange={e=>setServerId(e.target.value)}/></Field>
            <Field label="Основание и способ подтверждения"><Textarea required minLength={20} maxLength={3000} value={evidence} onChange={e=>setEvidence(e.target.value)}/></Field>
            <Button type="submit" disabled={busy||!profile?.emailVerified}>Подать Claim</Button>
          </form>
          {claims.map(c=><div key={c.id} className="space-y-2 text-[12px]"><p>{c.server_id}: {c.status==='PENDING'?'На проверке':c.status==='REJECTED'?'Отклонено':c.access_active?'Владение подтверждено':'Права владельца сняты'}{c.reason?` · ${c.reason}`:''}</p>{c.status==='PENDING'&&<ClaimProof id={c.id} onChecked={reload}/>}</div>)}
        </div>
      </details>
    </section>

    {profile?.roles?.includes('ADMIN')&&<section className="gs-account-card space-y-4 rounded-[22px] border p-5"><h2 className="text-[17px] font-semibold">Администратор: заявки Claim</h2>
      <Button onClick={()=>run(reload,'Очередь обновлена.')} disabled={busy}>Обновить</Button>
      {!queue.length&&<p className="text-[12px] opacity-60">Нет заявок на проверку.</p>}
      {queue.map(c=><div key={c.id} className="surface space-y-3 p-4"><p>{c.name??c.server_id}</p><p className="whitespace-pre-wrap break-words">{c.evidence}</p>
        <Field label="Результат проверки и основание решения"><Textarea minLength={10} maxLength={1000} value={reasons[c.id]??''} onChange={e=>setReasons({...reasons,[c.id]:e.target.value})}/></Field>
        <Field label="Код, лично проверенный на официальном ресурсе (для ручного способа)"><Input value={observedCodes[c.id]??''} onChange={e=>setObservedCodes({...observedCodes,[c.id]:e.target.value})}/></Field>
        <div className="flex gap-2">{['VERIFIED','REJECTED'].map(status=><Button key={status} disabled={busy||(reasons[c.id]??'').length<10} onClick={()=>run(async()=>{await apiSend(`/admin/claims/${c.id}/resolve`,{status,reason:reasons[c.id],observedToken:observedCodes[c.id]});await reload()},'Решение сохранено в журнале.')}>{status==='VERIFIED'?'Подтвердить':'Отклонить'}</Button>)}</div>
      </div>)}
    </section>}
  </main>
}

function OwnerSummary({server}:{server:Owned}) {
  const [edits,setEdits]=useState<SummaryEdit[]>([]),[summary,setSummary]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const path=`/owners/me/servers/${encodeURIComponent(server.server_id)}/summary-edits`
  useEffect(()=>{let active=true;apiRequest<SummaryEdit[]>(path).then(rows=>{if(active)setEdits(rows)})
    .catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить правки')})
    return()=>{active=false}},[path])
  async function submit(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');setMessage('')
    try {await apiSend(path,{summary});setEdits(await apiRequest<SummaryEdit[]>(path));setSummary('');setMessage('Правка отправлена на проверку.')}
    catch(e){setError(e instanceof Error?e.message:'Не удалось отправить правку')}
    finally{setBusy(false)}
  }
  return <div className="surface space-y-3 rounded-xl p-4">
    <p><a href={`/server/${server.slug}`}>{server.name}</a> · {server.game_id}</p>
    <p className="text-sm text-ink-400">Краткое фактическое описание публикуется после проверки администратором.</p>
    {edits.slice(0,2).map(edit=><p key={edit.id} className="text-sm">{edit.status==='PENDING'?'На проверке':edit.status==='APPROVED'?'Опубликовано':'Отклонено'}: {edit.summary}{edit.reason?` · ${edit.reason}`:''}</p>)}
    {error&&<p role="alert" className="text-danger-300">{error}</p>}{message&&<p role="status" className="text-signal-400">{message}</p>}
    {!edits.some(edit=>edit.status==='PENDING')&&<form onSubmit={submit} className="space-y-3">
      <Field label="Новое краткое описание"><Textarea required minLength={20} maxLength={280} value={summary} onChange={e=>setSummary(e.target.value)}/></Field>
      <Button type="submit" disabled={busy}>Отправить на проверку</Button>
    </form>}
  </div>
}

function OwnerFacts({server}:{server:Owned}) {
  const [edits,setEdits]=useState<FactEdit[]>([]),[field,setField]=useState('version'),[value,setValue]=useState(''),[evidence,setEvidence]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const path=`/owners/me/servers/${encodeURIComponent(server.server_id)}/fact-edits`
  useEffect(()=>{let active=true;apiRequest<FactEdit[]>(path).then(rows=>{if(active)setEdits(rows)})
    .catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить правки')})
    return()=>{active=false}},[path])
  async function submit(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');setMessage('')
    try {await apiSend(path,{field,value,evidence});setEdits(await apiRequest<FactEdit[]>(path));setValue('');setEvidence('');setMessage('Характеристика отправлена на проверку.')}
    catch(e){setError(e instanceof Error?e.message:'Не удалось отправить правку')}
    finally{setBusy(false)}
  }
  return <div className="surface space-y-3 rounded-xl p-4">
    <h3 className="font-medium">Характеристики · {server.name}</h3>
    <p className="text-sm text-ink-400">Укажите подтверждаемое значение и источник. Публичная карточка изменится только после проверки. Для удаления ссылки выберите её поле и оставьте адрес пустым.</p>
    {edits.slice(0,4).map(edit=><p key={edit.id} className="text-sm">{factLabels[edit.field]??edit.field}: {edit.value||'удалить ссылку'} · {edit.status==='PENDING'?'На проверке':edit.status==='APPROVED'?'Опубликовано':'Отклонено'}{edit.reason?` · ${edit.reason}`:''}</p>)}
    {error&&<p role="alert" className="text-danger-300">{error}</p>}{message&&<p role="status" className="text-signal-400">{message}</p>}
    <form onSubmit={submit} className="space-y-3">
      <Field label="Поле"><Select value={field} onChange={setField} options={Object.entries(factLabels).map(([value,label])=>({value,label}))}/></Field>
      <Field label={field==='openedAt'?'Дата ГГГГ-ММ-ДД':['site','discord','telegram'].includes(field)?'Публичный HTTPS-адрес (пусто — убрать ссылку)':'Новое значение'}><Input required={!['site','discord','telegram'].includes(field)} maxLength={['site','discord','telegram'].includes(field)?500:80} value={value} onChange={e=>setValue(e.target.value)} placeholder={field==='openedAt'?'2026-09-27':field==='modes'?'Survival, PvP':['site','discord','telegram'].includes(field)?'https://example.com/':undefined}/></Field>
      <Field label="Основание и источник"><Textarea required minLength={20} maxLength={1000} value={evidence} onChange={e=>setEvidence(e.target.value)}/></Field>
      <Button type="submit" disabled={busy||edits.some(edit=>edit.field===field&&edit.status==='PENDING')}>Отправить на проверку</Button>
    </form>
  </div>
}

function OwnerMonitoring({server}:{server:Owned}) {
  const method=server.game_id==='minecraft'?'GAME_PROTOCOL':server.game_id==='lineage2'?'LOGIN_SERVER':'SERVER_API'
  const path=`/owners/me/servers/${encodeURIComponent(server.server_id)}/monitoring`
  const [current,setCurrent]=useState<Monitor>(),[host,setHost]=useState(''),[port,setPort]=useState(''),[apiUrl,setApiUrl]=useState('')
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  useEffect(()=>{let active=true;apiRequest<Monitor>(path).then(row=>{if(!active)return
    setCurrent(row);setHost(row.host??'');setPort(row.port?String(row.port):'');setApiUrl(row.api_url??'')})
    .catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить мониторинг')})
    return()=>{active=false}},[path])
  async function save(enabled:boolean) {
    setBusy(true);setError('');setMessage('')
    try {
      await apiSend(path,{enabled,method,host,port:port?Number(port):null,apiUrl,reason})
      setCurrent(await apiRequest<Monitor>(path));setMessage(enabled?'Адрес проверки сохранён. Онлайн появится после успешной пробы.':'Проверка отключена.')
      setReason('')
    } catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить мониторинг')}
    finally{setBusy(false)}
  }
  return <div className="surface space-y-3 rounded-xl p-4">
    <h3 className="font-medium">Мониторинг · {server.name}</h3>
    <p className="text-sm text-ink-400">{method==='GAME_PROTOCOL'?'Minecraft Server List Ping':method==='LOGIN_SERVER'?'Проверка login-сервера L2 (без числа игроков)':'FiveM info.json, dynamic.json и players.json'}.
      Только публичный адрес без токенов. Статус и число появятся после фактической проверки; адрес можно отключить.</p>
    <p className="text-sm">{current===undefined?'Загрузка…':current.configured===false?'Адрес владельца пока не задан; источники открытого каталога могут проверяться отдельно.':current.held?'Проверка адреса приостановлена администратором; повторное включение возможно после пересмотра.':current.enabled?'Адрес владельца включён.':'Адрес владельца отключён.'}</p>
    {method==='SERVER_API'?<Field label="Адрес FiveM http(s)://host:port/"><Input value={apiUrl} onChange={e=>setApiUrl(e.target.value)} maxLength={500} placeholder="https://rp.example.com/" /></Field>
      :<div className="grid gap-3 sm:grid-cols-2"><Field label="Публичный host"><Input value={host} onChange={e=>setHost(e.target.value)} maxLength={253} placeholder="play.example.com" /></Field>
        <Field label={method==='LOGIN_SERVER'?'Порт login-сервера':'Порт (необязательно)'}><Input type="number" min={1} max={65535} value={port} onChange={e=>setPort(e.target.value)} /></Field></div>}
    <Field label="Причина изменения"><Textarea minLength={10} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} /></Field>
    {error&&<p role="alert" className="text-danger-300">{error}</p>}{message&&<p role="status" className="text-signal-400">{message}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy||!!current?.held||reason.trim().length<10} onClick={()=>void save(true)}>Сохранить адрес</Button>
      <Button variant="outline" disabled={busy||reason.trim().length<10} onClick={()=>void save(false)}>Отключить проверку</Button></div>
  </div>
}
