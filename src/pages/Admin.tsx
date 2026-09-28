import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiRequest, apiSend } from '@/repositories/http/client'
import { useSeo } from '@/lib/seo'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/controls'

type Tab={id:string;label:string;permission:string;path:string}
const tabs:Tab[]=[
  {id:'overview',label:'Обзор',permission:'system.read',path:'/admin/overview'},
  {id:'servers',label:'Серверы',permission:'servers.read',path:'/admin/servers'},
  {id:'server-edits',label:'Правки серверов',permission:'servers.review',path:'/admin/server-edits'},
  {id:'server-facts',label:'Характеристики',permission:'servers.review',path:'/admin/server-fact-edits'},
  {id:'users',label:'Пользователи',permission:'users.read',path:'/admin/users'},
  {id:'claims',label:'Claims',permission:'claims.review',path:'/admin/claims'},
  {id:'votes',label:'Голоса',permission:'votes.read',path:'/admin/votes'},
  {id:'vote-rules',label:'Правила голосования',permission:'votes.configure',path:'/admin/vote-rules'},
  {id:'support',label:'Поддержка',permission:'support.read',path:'/admin/support'},
  {id:'coins',label:'Coins',permission:'coins.read',path:'/admin/coins/ledger'},
  {id:'payments',label:'Платежи',permission:'payments.read',path:'/admin/payments'},
  {id:'moderation',label:'Модерация',permission:'moderation.manage',path:'/admin/moderation/nicknames'},
  {id:'copyright',label:'Copyright',permission:'copyright.read',path:'/admin/copyright'},
  {id:'system',label:'События',permission:'system.read',path:'/admin/system'},
]
type Row=Record<string,unknown>
const value=(row:Row,key:string)=>String(row[key]??'—')
const date=(row:Row,key:string)=>row[key]?new Date(String(row[key])).toLocaleString('ru-RU'):'—'

export default function Admin() {
  useSeo({title:'Админский кабинет',path:'/admin',noindex:true})
  const auth=useAuth(),permissions=auth.user?.permissions??[]
  const allowed=tabs.filter(tab=>permissions.includes(tab.permission))
  const [selected,setSelected]=useState('overview'),[data,setData]=useState<unknown>()
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [reasons,setReasons]=useState<Record<string,string>>({})
  const active=allowed.find(tab=>tab.id===selected)??allowed[0]
  async function load(tab:Tab) {
    setLoading(true);setError('')
    try {setData(await apiRequest<unknown>(tab.path))}
    catch(e) {setData(undefined);setError(e instanceof Error?e.message:'Не удалось загрузить данные')}
    finally {setLoading(false)}
  }
  useEffect(()=>{if(active) void load(active)},[active?.id,auth.user?.id])
  async function act(task:()=>Promise<unknown>) {
    if(!active)return
    setBusy(true);setError('')
    try {await task();await auth.refresh();await load(active)}
    catch(e) {setError(e instanceof Error?e.message:'Не удалось сохранить решение')}
    finally {setBusy(false)}
  }
  if(auth.loading)return <main className="mx-auto max-w-6xl p-6">Проверяем права…</main>
  if(!auth.privateCore||!auth.user||!allowed.length)return <main className="mx-auto max-w-6xl p-6"><h1 className="text-2xl">Админский кабинет</h1><p className="mt-3 text-ink-400">Нет доступа к админскому кабинету.</p></main>
  const rows=Array.isArray(data)?data as Row[]:[]
  const summary=(!Array.isArray(data)&&data&&typeof data==='object')?data as Row:{}
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-8">
    <h1 className="text-2xl font-semibold">Админский кабинет</h1>
    <p className="text-sm text-ink-400">Доступ к разделам определяется разрешениями аккаунта. Изменения Claim и ролей записываются в журнал.</p>
    <nav aria-label="Разделы админки" className="flex flex-wrap gap-2">{allowed.map(tab=><Button key={tab.id} variant={active.id===tab.id?'primary':'outline'} onClick={()=>setSelected(tab.id)}>{tab.label}</Button>)}</nav>
    {error&&<p role="alert" className="text-danger-300">{error}</p>}
    {loading?<p>Загрузка…</p>:<>
      {active.id==='overview'&&<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
        ['Пользователи','users'],['Серверы','servers'],['Claims на проверке','pending_claims'],
        ['Голоса','votes'],['События Поддержки','support_events'],['Ожидают тестовой оплаты','pending_test_payments'],
      ].map(([label,key])=><div key={key} className="surface rounded-xl p-4"><p className="text-sm text-ink-400">{label}</p><strong className="text-xl">{value(summary,key)}</strong></div>)}</section>}
      {active.id==='system'&&<section className="space-y-3"><h2 className="text-lg">Публичная проекция</h2><pre className="surface overflow-auto rounded-xl p-4 text-xs">{JSON.stringify(summary.projection??{},null,2)}</pre>
        <h2 className="text-lg">Оповещения</h2>{(Array.isArray(summary.alerts)?summary.alerts as Row[]:[]).map(row=><article key={value(row,'key')} className="surface rounded-xl p-4 text-sm"><strong>{value(row,'key')}</strong> · {row.active?'Требует внимания':'В норме'} · {row.active?date(row,'opened_at'):date(row,'resolved_at')}</article>)}
        <h2 className="text-lg">Очереди проверки и уведомлений</h2><pre className="surface overflow-auto rounded-xl p-4 text-xs">{JSON.stringify(summary.queues??{},null,2)}</pre>
        <h2 className="text-lg">Последние системные события</h2>{(Array.isArray(summary.events)?summary.events as Row[]:[]).map(row=><article key={value(row,'id')} className="surface rounded-xl p-4 text-sm">{value(row,'action')} · {value(row,'target')} · {date(row,'created_at')}</article>)}
      </section>}
      {active.id==='payments'&&<PaymentReconciliation />}
      {active.id==='vote-rules'&&<VoteRulesEditor key={JSON.stringify(summary)} current={summary} busy={busy}
        onSave={input=>act(()=>apiSend('/admin/vote-rules',input))}/>}
      {!['overview','system','vote-rules'].includes(active.id)&&<section className="space-y-3" aria-label={active.label}>
        {!rows.length&&<p className="text-ink-400">В этом разделе пока нет записей.</p>}
        {rows.map((row,index)=><article key={value(row,'id')==='—'?`${active.id}-${index}`:value(row,'id')} className="surface space-y-2 rounded-xl p-4 text-sm">
          {active.id==='users'&&<><strong>{value(row,'display_name')}</strong><p>{value(row,'email')} · {row.email_verified_at?'Email подтверждён':'Email не подтверждён'} · {row.banned_at?'Заблокирован':'Активен'} · {date(row,'created_at')}</p>
            <p className="break-all text-xs text-ink-400">ID {value(row,'id')} · роли: {Array.isArray(row.roles)&&row.roles.length?row.roles.join(', '):'PLAYER'}</p>
            {permissions.includes('roles.manage')&&row.id!==auth.user?.id&&<div className="flex flex-wrap gap-2">{(['MODERATOR','FINANCE','COPYRIGHT','SUPPORT'] as const).map(role=>{
              const has=Array.isArray(row.roles)&&row.roles.includes(role)
              return <Button key={role} variant="outline" disabled={busy} onClick={()=>void act(()=>apiSend(`/admin/users/${encodeURIComponent(value(row,'id'))}/roles`,{role,action:has?'REVOKE':'GRANT'}))}>{has?'Снять':'Дать'} {role}</Button>
            })}</div>}
            {permissions.includes('users.manage')&&row.id!==auth.user?.id&&!(Array.isArray(row.roles)&&row.roles.includes('ADMIN'))&&<div className="space-y-2">
              <Textarea aria-label={`Основание модерации пользователя ${value(row,'display_name')}`} minLength={10} maxLength={1000} value={reasons[value(row,'id')]??''} onChange={e=>setReasons({...reasons,[value(row,'id')]:e.target.value})}/>
              <Button variant="outline" disabled={busy||(reasons[value(row,'id')]??'').trim().length<10}
                onClick={()=>void act(()=>apiSend(`/admin/users/${encodeURIComponent(value(row,'id'))}/moderation`,{action:row.banned_at?'UNBAN':'BAN',reason:reasons[value(row,'id')]}))}>{row.banned_at?'Разблокировать':'Заблокировать'}</Button>
            </div>}
          </>}
          {active.id==='servers'&&<><strong>{value(row,'name')}</strong><p>{value(row,'game_id')} · {value(row,'server_id')} · владелец: {value(row,'owner_id')} · Claims: {value(row,'pending_claims')}</p></>}
          {active.id==='server-edits'&&<><strong>{value(row,'name')} · {value(row,'game_id')}</strong><p className="whitespace-pre-wrap break-words">{value(row,'summary')}</p>
            <Textarea aria-label="Основание решения" minLength={10} maxLength={1000} value={reasons[value(row,'id')]??''} onChange={e=>setReasons({...reasons,[value(row,'id')]:e.target.value})}/>
            <div className="flex gap-2">{(['APPROVED','REJECTED'] as const).map(status=><Button key={status} disabled={busy||(reasons[value(row,'id')]??'').trim().length<10}
              onClick={()=>void act(()=>apiSend(`/admin/server-edits/${encodeURIComponent(value(row,'id'))}/resolve`,{status,reason:reasons[value(row,'id')]}))}>{status==='APPROVED'?'Опубликовать':'Отклонить'}</Button>)}</div>
          </>}
          {active.id==='server-facts'&&<><strong>{value(row,'name')} · {value(row,'game_id')}</strong><p>{value(row,'field')}: {value(row,'value')}</p><p className="whitespace-pre-wrap break-words text-ink-400">Основание: {value(row,'evidence')}</p>
            <Textarea aria-label="Основание решения" minLength={10} maxLength={1000} value={reasons[value(row,'id')]??''} onChange={e=>setReasons({...reasons,[value(row,'id')]:e.target.value})}/>
            <div className="flex gap-2">{(['APPROVED','REJECTED'] as const).map(status=><Button key={status} disabled={busy||(reasons[value(row,'id')]??'').trim().length<10}
              onClick={()=>void act(()=>apiSend(`/admin/server-fact-edits/${encodeURIComponent(value(row,'id'))}/resolve`,{status,reason:reasons[value(row,'id')]}))}>{status==='APPROVED'?'Опубликовать':'Отклонить'}</Button>)}</div>
          </>}
          {active.id==='claims'&&<><strong>{value(row,'name')} · {value(row,'server_id')}</strong><p className="whitespace-pre-wrap break-words">{value(row,'evidence')}</p>
            <Textarea aria-label="Основание решения" minLength={10} maxLength={1000} value={reasons[value(row,'id')]??''} onChange={e=>setReasons({...reasons,[value(row,'id')]:e.target.value})}/>
            <div className="flex gap-2">{(['VERIFIED','REJECTED'] as const).map(status=><Button key={status} disabled={busy||(reasons[value(row,'id')]??'').trim().length<10}
              onClick={()=>void act(()=>apiSend(`/admin/claims/${encodeURIComponent(value(row,'id'))}/resolve`,{status,reason:reasons[value(row,'id')]}))}>{status==='VERIFIED'?'Подтвердить':'Отклонить'}</Button>)}</div>
          </>}
          {active.id==='votes'&&<><strong>{value(row,'server_id')}</strong><p>Голос {value(row,'id')} · пользователь {value(row,'user_id')} · ASN {value(row,'asn')} · {date(row,'created_at')}</p></>}
          {active.id==='support'&&<><strong>{value(row,'server_id')} · {value(row,'coins')} Coins</strong><p>{value(row,'public_nick')} · {row.anonymous?'анонимно':'публично'} · {value(row,'nickname_decision')} · {date(row,'created_at')}</p></>}
          {active.id==='coins'&&<><strong>{value(row,'kind')} · {value(row,'delta')} Coins</strong><p>Пользователь {value(row,'user_id')} · связь {value(row,'related_id')} · {date(row,'created_at')}</p></>}
          {active.id==='payments'&&<><strong>Тестовый заказ {value(row,'id')} · {value(row,'status')}</strong><p>{value(row,'coins')} Coins · {Number(row.amount_kopecks)/100} ₽ · пользователь {value(row,'user_id')} · {date(row,'created_at')}</p></>}
          {active.id==='moderation'&&<><strong>{value(row,'nickname')} · {value(row,'status')}</strong><p>Сервер {value(row,'server_id')} · попыток AI: {value(row,'attempts')} · {date(row,'created_at')}</p>
            <Textarea aria-label="Основание модерации" minLength={10} maxLength={1000} value={reasons[value(row,'support_id')]??''}
              onChange={e=>setReasons({...reasons,[value(row,'support_id')]:e.target.value})}/>
            <div className="flex gap-2">{(['ALLOW','ANONYMOUS'] as const).map(decision=><Button key={decision} disabled={busy||(reasons[value(row,'support_id')]??'').trim().length<10}
              onClick={()=>void act(()=>apiSend(`/admin/moderation/nicknames/${encodeURIComponent(value(row,'support_id'))}/resolve`,
                {decision,reason:reasons[value(row,'support_id')]}))}>{decision==='ALLOW'?'Показать ник':'Оставить анонимно'}</Button>)}</div>
          </>}
          {active.id==='copyright'&&<><strong>Претензия {value(row,'id')} · {value(row,'status')}</strong>
            <p>Сервер {value(row,'server_id')} · ссылка {value(row,'material_key')} · {date(row,'created_at')}</p>
            <p className="break-all">{value(row,'material_url')}</p>
            <p>Заявитель: {value(row,'claimant_name')} · {value(row,'contact_email')}</p>
            <p className="whitespace-pre-wrap break-words">Права: {value(row,'rights_basis')}</p>
            <p className="whitespace-pre-wrap break-words">Произведение: {value(row,'work_description')}</p>
            <p className="whitespace-pre-wrap break-words">Сведения: {value(row,'evidence')}</p>
            <p>AI: {value(row,'ai_classification')} · {value(row,'ai_reason')}</p>
            {permissions.includes('copyright.review')&&<><Textarea aria-label="Основание решения по претензии" minLength={10} maxLength={1000}
              value={reasons[value(row,'id')]??''} onChange={e=>setReasons({...reasons,[value(row,'id')]:e.target.value})}/>
              <div className="flex flex-wrap gap-2">{(['RESTRICT','RESTORE','REJECT','REQUEST_INFO'] as const).map(action=><Button key={action} variant="outline"
                disabled={busy||(reasons[value(row,'id')]??'').trim().length<10}
                onClick={()=>void act(()=>apiSend(`/admin/copyright/${encodeURIComponent(value(row,'id'))}/resolve`,{action,reason:reasons[value(row,'id')]}))}>
                  {{RESTRICT:'Временно ограничить',RESTORE:'Восстановить',REJECT:'Отклонить',REQUEST_INFO:'Запросить уточнения'}[action]}</Button>)}</div>
            </>}
          </>}
        </article>)}
      </section>}
    </>}
  </main>
}

const ruleFields=[
  {key:'windowHours',label:'Окно голосования, часы',min:1,max:2160},
  {key:'maxPerWindow',label:'Голосов аккаунта за окно',min:1,max:20},
  {key:'ipDailyLimit',label:'Порог IP за сутки',min:1,max:100},
  {key:'deviceDailyLimit',label:'Порог device за сутки',min:1,max:100},
  {key:'asnDailyLimit',label:'Порог ASN за сутки',min:1,max:100000},
] as const

function VoteRulesEditor({current,busy,onSave}:{current:Row;busy:boolean;onSave:(input:Row)=>Promise<void>}) {
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(ruleFields.map(field=>[field.key,String(current[field.key]??'')])))
  const [reason,setReason]=useState('')
  return <section className="surface max-w-2xl space-y-4 rounded-xl p-5" aria-label="Правила голосования">
    <h2 className="text-lg font-medium">Rolling-окно и антифрод</h2>
    <p className="text-sm text-ink-400">Новые правила действуют сразу. Принятые голоса остаются в журнале; пересчитывается только текущее окно рейтинга. Пороги вызывают дополнительную проверку и не доказывают уникальность человека.</p>
    <form className="space-y-3" onSubmit={event=>{event.preventDefault();void onSave({...Object.fromEntries(ruleFields.map(field=>[field.key,Number(values[field.key])])),reason})}}>
      <div className="grid gap-3 sm:grid-cols-2">{ruleFields.map(field=><Field key={field.key} label={field.label}>
        <Input type="number" required min={field.min} max={field.max} step={1} value={values[field.key]}
          onChange={event=>setValues({...values,[field.key]:event.target.value})}/>
      </Field>)}</div>
      <Field label="Основание изменения"><Textarea required minLength={10} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/></Field>
      <Button type="submit" disabled={busy||reason.trim().length<10}>Сохранить правила</Button>
    </form>
  </section>
}

function PaymentReconciliation() {
  const [report,setReport]=useState<{orderMismatch:Row[];balanceMismatch:Row[]}>(),[error,setError]=useState('')
  return <section className="space-y-2"><Button variant="outline" onClick={()=>void apiRequest<{orderMismatch:Row[];balanceMismatch:Row[]}>('/admin/payments/reconciliation').then(setReport).catch(e=>setError(e instanceof Error?e.message:'Сверка недоступна'))}>Сверить ledger</Button>
    {error&&<p role="alert" className="text-danger-300">{error}</p>}
    {report&&<p role="status">Расхождения заказов: {report.orderMismatch.length}; балансов: {report.balanceMismatch.length}. {report.orderMismatch.length+report.balanceMismatch.length>0?'Требуется ручная проверка.':'Расхождений в локальной базе не найдено.'}</p>}
  </section>
}
