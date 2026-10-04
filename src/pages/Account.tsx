import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
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
import { WorldIcon } from '@/components/icons/WorldIcon'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

type Claim = { id:string; server_id:string; status:string; access_active?:boolean; reason?:string; evidence?:string; name?:string }
type Owned = {server_id:string;name:string;slug:string;game_id:string}
type SummaryEdit = {id:string;summary:string;status:string;reason?:string;created_at:string}
type FactEdit = {id:string;field:string;value:string;status:string;reason?:string;created_at:string}
type Monitor = {configured?:false;enabled?:boolean;held?:boolean;host?:string|null;port?:number|null;api_url?:string|null;updated_at?:string}
const factLabels:Record<string,string>={version:'Версия',rates:'Рейты',modes:'Режимы',region:'Регион',country:'Страна',openedAt:'Дата открытия',site:'Сайт',discord:'Discord',telegram:'Telegram'}
type Profile = {email?:string;emailVerified?:boolean;permissions?:string[];roles?:string[];loginMethod?:string|null}
const providerLabels:Record<string,string>={google:'Google',vk:'VK',yandex:'Яндекс',discord:'Discord'}

export default function Account() {
  useSeo({title:'Аккаунт',path:'/account',noindex:true})
  const auth=useAuth(), profile=auth.user as (typeof auth.user & Profile)
  const {scoped}=useWorldNavigation()
  const [mode,setMode]=useState<'login'|'register'|'reset'>('login')
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState('')
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [linkToken,setLinkToken]=useState(''),[purpose,setPurpose]=useState('')
  const [claims,setClaims]=useState<Claim[]>([]),[owned,setOwned]=useState<Owned[]>([])
  const [serverId,setServerId]=useState(()=>new URLSearchParams(location.search).get('claim')??'')
  const [evidence,setEvidence]=useState('')
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
  const playerStatus=profile?.roles?.includes('OWNER')?'Игрок и владелец':'Игрок'
  const copyEmail=()=>{if(profile?.email&&navigator.clipboard)void navigator.clipboard.writeText(profile.email)}

  return <main className="gs-account-page gs-account-premium mx-auto w-full space-y-6 px-4 py-6 sm:py-8">
    <section className="gs-account-hero relative overflow-hidden rounded-[26px] border px-5 py-6 sm:px-7 sm:py-8">
      <div className="relative z-10 max-w-[420px]">
        <p className="gs-account-kicker text-[12px] font-semibold uppercase tracking-[0.16em]">Аккаунт</p>
        <h1 className="mt-1 text-[32px] font-bold leading-[1.05] sm:text-[38px]">GameScout</h1>
        <p className="mt-3 max-w-sm text-[14px] leading-relaxed">Профиль, поддержка проектов и управление своими серверами.</p>
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

    <div className="gs-account-grid">
    <aside className="gs-account-sidebar space-y-5" aria-label="Профиль и Coins">
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
            {profile?.email&&<button type="button" onClick={copyEmail} aria-label="Скопировать email" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-current/5"><WorldIcon name="copy" size={13}/></button>}
          </div>
          {profile?.email&&<div className="mt-1 flex items-center gap-1.5 text-[11px] opacity-65">{profile.emailVerified?<><WorldIcon name="shield" size={13} className="text-signal-400"/> Email подтверждён</>:<>Email требует подтверждения</>}</div>}
          <div className="gs-login-method mt-3 inline-flex items-center gap-2 text-[13px]">
            {profile?.loginMethod==='google'?<GoogleBrandIcon/>:profile?.loginMethod==='discord'?<DiscordBrandIcon/>:profile?.loginMethod==='email'?<Mail size={18}/>:<WorldIcon name="profile" size={18}/>}
            <span>{profile?.loginMethod==='email'?'Вход по почте':profile?.loginMethod?`Вход через ${providerLabels[profile.loginMethod]??profile.loginMethod}`:'Способ входа не сохранён'}</span>
          </div>
        </div>
      </div>
      {!profile?.email&&<form onSubmit={e=>{e.preventDefault();void run(()=>apiSend('/me/email',{email}),'Ссылка отправлена на почту.')}} className="mt-4 flex gap-2">
        <Input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/>
        <Button type="submit" disabled={busy}>Подтвердить</Button>
      </form>}
    </section>

    <AccountCoins key={auth.user.id}/>
    </aside>
    <div className="gs-account-workspace space-y-5">

    <section className="gs-account-servers space-y-3">
      <h2 className="flex items-center justify-between text-[18px] font-semibold"><span>Мои серверы</span><WorldIcon name="chevronRight" size={18} className="opacity-55"/></h2>
      {!owned.length?<div className="gs-account-empty rounded-[22px] border px-5 py-7 text-center">
        <span className="gs-account-empty-icon mx-auto grid h-14 w-14 place-items-center rounded-full"><WorldIcon name="servers" size={25}/></span>
        <h3 className="mt-4 text-[15px] font-semibold">Подтверждённых серверов пока нет</h3>
        <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed opacity-62">Добавьте сервер, чтобы отслеживать онлайн, рейтинг и получать уведомления.</p>
        <Button to={scoped('/catalog')} className="gs-find-server mt-5 h-11 min-w-[220px] rounded-xl" icon={<WorldIcon name="search" size={16}/>} iconRight={<WorldIcon name="chevronRight" size={16}/>}>Найти серверы</Button>
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


    </div>
    </div>
    <div className="gs-account-exit flex justify-end pt-5">
      <button type="button" disabled={busy} onClick={()=>run(()=>auth.logout(),'Вы вышли.')} className="gs-account-action inline-flex min-h-11 items-center gap-2 rounded-xl border px-5 text-sm disabled:opacity-50"><WorldIcon name="logout" size={17}/>Выйти из аккаунта</button>
    </div>
  </main>
}

function GoogleBrandIcon() {
  return <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden>
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.51 5.51 0 0 1-2.39 3.62v3.01h3.87c2.27-2.09 3.56-5.17 3.56-8.66z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.87-3.01c-1.07.72-2.44 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1A12 12 0 0 0 12 24z"/>
    <path fill="#FBBC05" d="M5.27 14.29A7.24 7.24 0 0 1 4.89 12c0-.8.14-1.57.38-2.29v-3.1H1.27A12 12 0 0 0 0 12c0 1.93.46 3.76 1.27 5.39l4-3.1z"/>
    <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.61 4.58 1.79l3.43-3.43A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4 3.1c.95-2.84 3.6-4.95 6.73-4.95z"/>
  </svg>
}

function DiscordBrandIcon() {
  return <span className="grid h-8 w-8 place-items-center rounded-full bg-[#5865F2]">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="white">
      <path d="M19.5 5.35A17.2 17.2 0 0 0 15.22 4l-.52 1.06a15.8 15.8 0 0 0-5.39 0L8.78 4A17.6 17.6 0 0 0 4.5 5.36C1.8 9.37 1.07 13.28 1.43 17.13a17.4 17.4 0 0 0 5.25 2.65l1.28-1.75a10.8 10.8 0 0 1-2.02-.97l.5-.39c3.9 1.8 8.13 1.8 11.98 0l.51.39c-.65.38-1.33.7-2.03.97l1.28 1.75a17.3 17.3 0 0 0 5.25-2.65c.43-4.46-.73-8.33-3.93-11.78ZM8.6 14.78c-1.17 0-2.13-1.08-2.13-2.4 0-1.33.94-2.41 2.13-2.41 1.2 0 2.15 1.09 2.13 2.4 0 1.33-.94 2.41-2.13 2.41Zm6.8 0c-1.17 0-2.13-1.08-2.13-2.4 0-1.33.94-2.41 2.13-2.41 1.2 0 2.15 1.09 2.13 2.4 0 1.33-.93 2.41-2.13 2.41Z"/>
    </svg>
  </span>
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
