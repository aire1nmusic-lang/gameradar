import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiRequest, apiSend } from '@/repositories/http/client'
import { useSeo } from '@/lib/seo'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'

type Claim = { id:string; server_id:string; status:string; reason?:string; evidence?:string; name?:string }
type Owned = {server_id:string;name:string;slug:string;game_id:string}
type SummaryEdit = {id:string;summary:string;status:string;reason?:string;created_at:string}
type Profile = {email?:string;emailVerified?:boolean;permissions?:string[]}
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
  useEffect(()=>{
    const params=new URLSearchParams(location.hash.slice(1))
    setLinkToken(params.get('token')??''); setPurpose(params.get('purpose')??'')
    // Remove sensitive fragments before any further navigation; never send them to analytics.
    if(params.has('token')) history.replaceState(null,'',location.pathname+location.search)
  },[])
  async function reload() {
    await auth.refresh()
    const [c,s]=await Promise.all([apiRequest<Claim[]>('/owners/me/claims'),apiRequest<Owned[]>('/owners/me/servers')])
    setClaims(c);setOwned(s)
    if(profile?.permissions?.includes('claims.review')) setQueue(await apiRequest<Claim[]>('/admin/claims'))
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
  return <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
    <h1 className="text-2xl font-semibold">Аккаунт GameScout</h1>
    {error&&<p role="alert" className="text-danger-300">{error}</p>}
    {message&&<p role="status" className="text-signal-400">{message}</p>}
    {linkToken&&<section className="surface space-y-3 p-5">
      <h2>Подтверждение {purpose==='reset'?'нового пароля':'email'}</h2>
      {purpose==='reset'&&<Field label="Новый пароль — от 12 символов"><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></Field>}
      <Button disabled={busy} onClick={()=>run(async()=>{
        const path=purpose==='reset'?'/auth/password/reset':purpose==='email'?'/me/email/confirm':'/auth/register/confirm'
        await apiSend(path,{token:linkToken,password});setLinkToken('')
      },purpose==='reset'?'Пароль изменён. Войдите заново.':'Email подтверждён.')}>Подтвердить</Button>
    </section>}
    {!auth.user?<>
      <div className="flex flex-wrap gap-2">{(['login','register','reset'] as const).map(x=><Button key={x} onClick={()=>setMode(x)}>{x==='login'?'Вход':x==='register'?'Регистрация':'Восстановление'}</Button>)}</div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field>
        {mode==='register'&&<Field label="Имя"><Input required minLength={2} maxLength={40} autoComplete="nickname" value={name} onChange={e=>setName(e.target.value)}/></Field>}
        {mode!=='reset'&&<Field label="Пароль — от 12 до 128 символов"><Input type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></Field>}
        <Button type="submit" disabled={busy}>{busy?'Подождите…':mode==='login'?'Войти':'Отправить письмо'}</Button>
      </form>
      <div className="flex flex-wrap gap-2">{auth.providers.map(p=><Button key={p} onClick={()=>location.assign(`/api/v1/auth/${p}?next=/account`)}>Войти через {providerLabels[p]??p}</Button>)}</div>
    </>:<>
      <section className="surface space-y-3 p-5"><h2 className="text-lg">{auth.user.displayName}</h2>
        <p>{profile?.email??'Email не привязан'} · {profile?.emailVerified?'Подтверждён':'Нужно подтверждение для голосования и Claim'}</p>
        {!profile?.email&&<form onSubmit={e=>{e.preventDefault();void run(()=>apiSend('/me/email',{email}),'Ссылка отправлена на почту.')}} className="space-y-3"><Field label="Email"><Input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field><Button type="submit" disabled={busy}>Подтвердить email</Button></form>}
        <div className="flex flex-wrap gap-2">{auth.providers.map(p=><Button key={p} onClick={()=>location.assign(`/api/v1/auth/${p}?link=1&next=/account`)}>Привязать {providerLabels[p]??p}</Button>)}</div>
        <Button disabled={busy} onClick={()=>run(()=>auth.logout(),'Вы вышли.')}>Выйти</Button>
        {!!profile?.permissions?.length&&<Button to="/admin" variant="outline">Админский кабинет</Button>}
      </section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">Мои серверы</h2>
        {!owned.length?<p className="text-ink-400">Подтверждённых серверов пока нет.</p>:owned.map(s=><OwnerSummary key={s.server_id} server={s}/>)}
        <h3>Подтверждение прав на сервер</h3><p className="text-ink-400">Заявку проверяет администратор. Укажите, как можно проверить ваши права; пароли и секреты не присылайте.</p>
        <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{await apiSend('/claims',{serverId,evidence});await reload()},'Заявка передана на проверку.')}}>
          <Field label="ID сервера"><Input required value={serverId} onChange={e=>setServerId(e.target.value)}/></Field>
          <Field label="Основание и способ подтверждения"><Textarea required minLength={20} maxLength={3000} value={evidence} onChange={e=>setEvidence(e.target.value)}/></Field>
          <Button type="submit" disabled={busy||!profile?.emailVerified}>Подать Claim</Button>
        </form>
        {claims.map(c=><p key={c.id}>{c.server_id}: {c.status}{c.reason?` · ${c.reason}`:''}</p>)}
      </section>
      {profile?.permissions?.includes('claims.review')&&<section className="space-y-4"><h2 className="text-lg font-semibold">Администратор: заявки Claim</h2>
        <Button onClick={()=>run(reload,'Очередь обновлена.')} disabled={busy}>Обновить</Button>
        {!queue.length&&<p>Нет заявок на проверку.</p>}
        {queue.map(c=><div key={c.id} className="surface space-y-3 p-4"><p>{c.name??c.server_id}</p><p className="whitespace-pre-wrap break-words">{c.evidence}</p>
          <Field label="Результат проверки и основание решения"><Textarea minLength={10} maxLength={1000} value={reasons[c.id]??''} onChange={e=>setReasons({...reasons,[c.id]:e.target.value})}/></Field>
          <div className="flex gap-2">{['VERIFIED','REJECTED'].map(status=><Button key={status} disabled={busy||(reasons[c.id]??'').length<10} onClick={()=>run(async()=>{await apiSend(`/admin/claims/${c.id}/resolve`,{status,reason:reasons[c.id]});await reload()},'Решение сохранено в журнале.')}>{status==='VERIFIED'?'Подтвердить':'Отклонить'}</Button>)}</div>
        </div>)}
      </section>}
    </>}
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
