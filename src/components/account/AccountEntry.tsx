import { useState, type ReactNode, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/controls'

type Mode='login'|'register'|'reset'
type Props={mode:Mode;setMode:(mode:Mode)=>void;email:string;setEmail:(v:string)=>void;password:string;setPassword:(v:string)=>void;name:string;setName:(v:string)=>void;busy:boolean;error:string;message:string;registrationOpen:boolean;providers:string[];submit:(e:FormEvent)=>void;confirmation:ReactNode;apiError:string}
const labels:Record<string,string>={google:'Google',discord:'Discord',vk:'VK',yandex:'Яндекс'}
export function AccountEntry(p:Props) {
  const [visible,setVisible]=useState(false)
  const title=p.confirmation?'Подтверждение аккаунта':p.mode==='reset'?'Вернём доступ':p.mode==='register'?'Твоя история начинается здесь':'С возвращением'
  return <div className="relative isolate flex min-h-[calc(100svh-60px)] items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10"><img src="/media/hub/nave-1920.webp" alt="" className="h-full w-full object-cover opacity-30"/><div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/70 to-ink-950"/></div>
    <section className="grid w-full max-w-[920px] overflow-hidden rounded-[28px] border border-white/12 bg-ink-950/80 shadow-[0_30px_100px_rgba(0,0,0,0.5)] backdrop-blur-xl lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between border-r border-white/8 bg-gradient-to-br from-signal-500/10 via-transparent to-white/[0.02] p-10 lg:flex">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-ink-300 hover:text-white"><ArrowLeft size={16}/>В зал миров</Link>
        <div className="py-14"><p className="mb-5 text-sm font-semibold tracking-[0.18em] text-signal-300">GAMESCOUT</p><h2 className="text-4xl leading-[1.15] tracking-tight">Твой аккаунт.<br/>Твои миры.</h2><p className="mt-5 max-w-64 text-sm leading-6 text-ink-300">Выбирай серверы, голосуй и поддерживай проекты, в которых хочешь играть.</p></div>
        <p className="flex items-center gap-2 text-xs text-ink-400"><ShieldCheck size={16}/>Один аккаунт для игрока и владельца</p>
      </aside>
      <div className="min-w-0 p-6 sm:p-10">
        <Link to="/" className="mb-7 inline-flex items-center gap-2 text-xs text-ink-400 hover:text-white lg:hidden"><ArrowLeft size={14}/>В зал миров</Link>
        <p className="mb-2 text-xs tracking-[0.16em] text-ink-400 uppercase">Аккаунт GameScout</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-400">{p.confirmation?'Заверши действие по ссылке из письма.':p.mode==='reset'?'Отправим ссылку для нового пароля на твою почту.':p.mode==='register'?'Создай аккаунт и подтверди почту, чтобы голосовать и поддерживать серверы.':'Войди удобным способом, чтобы продолжить.'}</p>
        <div className="mt-6 space-y-4">
          {p.confirmation}
          {(p.error||p.apiError)&&<p role="alert" className="rounded-xl border border-danger-400/20 bg-danger-400/5 p-3 text-sm text-danger-300">{p.error||p.apiError}</p>}
          {p.message&&<p role="status" className="rounded-xl border border-signal-400/20 bg-signal-400/5 p-3 text-sm text-signal-300">{p.message}</p>}
          {!p.confirmation&&<>
          {p.mode!=='reset'&&p.providers.length>0&&<><div className="grid gap-2 sm:grid-cols-2">{p.providers.map(provider=><Button key={provider} type="button" full variant="outline" disabled={p.busy||!!p.apiError} size="lg" className="rounded-xl border-white/15 bg-white/[0.03]"
            onClick={()=>location.assign(`/api/v1/auth/${provider}?next=/account`)}><span aria-hidden className="text-base font-bold">{provider==='google'?'G':provider==='discord'?'◈':labels[provider]?.slice(0,1)}</span>{labels[provider]??provider}</Button>)}</div><div className="flex items-center gap-3 text-xs text-ink-500"><span className="h-px flex-1 bg-white/8"/>или по почте<span className="h-px flex-1 bg-white/8"/></div></>}
          <form onSubmit={p.submit} className="space-y-4">
            {p.mode==='register'&&<Field label="Никнейм"><Input className="h-12 rounded-xl" required autoComplete="nickname" minLength={2} maxLength={40} value={p.name} onChange={e=>p.setName(e.target.value)}/></Field>}
            <Field label="Почта"><Input className="h-12 rounded-xl" type="email" autoComplete="email" placeholder="you@example.com" required value={p.email} onChange={e=>p.setEmail(e.target.value)}/></Field>
            {p.mode!=='reset'&&<div><div className="mb-2 flex items-center justify-between"><label htmlFor="account-password" className="text-sm text-ink-300">Пароль</label>{p.mode==='login'&&<button type="button" disabled={p.busy} onClick={()=>{p.setMode('reset');p.setPassword('');setVisible(false)}} className="text-xs text-ink-400 hover:text-signal-300">Забыли пароль?</button>}</div>
              <div className="relative"><Input id="account-password" className="h-12 rounded-xl pr-12" type={visible?'text':'password'} autoComplete={p.mode==='login'?'current-password':'new-password'} required minLength={12} maxLength={128} value={p.password} onChange={e=>p.setPassword(e.target.value)}/><button type="button" aria-label={visible?'Скрыть пароль':'Показать пароль'} aria-pressed={visible} onClick={()=>setVisible(!visible)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-400 hover:text-white">{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
              {p.mode==='register'&&<p className="mt-2 text-xs text-ink-500">От 12 до 128 символов</p>}</div>}
            <Button type="submit" full variant="primary" size="lg" className="rounded-xl" disabled={p.busy||!!p.apiError||(p.mode==='register'&&!p.registrationOpen)} iconRight={p.mode==='reset'?<Mail size={16}/>:<ArrowRight size={16}/>}>{p.busy?'Подождите…':p.mode==='login'?'Войти':p.mode==='register'?'Создать аккаунт':'Отправить ссылку'}</Button>
          </form>
          {p.mode==='reset'?<button type="button" disabled={p.busy} onClick={()=>p.setMode('login')} className="inline-flex items-center gap-2 text-sm text-ink-300 hover:text-white"><ArrowLeft size={14}/>Вернуться ко входу</button>:p.registrationOpen?<p className="text-center text-sm text-ink-400">{p.mode==='login'?'Ещё нет аккаунта?':'Уже есть аккаунт?'} <button type="button" disabled={p.busy} onClick={()=>{p.setMode(p.mode==='login'?'register':'login');p.setPassword('');setVisible(false)}} className="text-signal-300 hover:text-white">{p.mode==='login'?'Создать':'Войти'}</button></p>:<p className="rounded-xl bg-white/[0.03] p-3 text-xs leading-5 text-ink-400">Регистрация пока закрыта. Существующие аккаунты могут войти; искать серверы можно без аккаунта.</p>}
          </>}
          <p className="text-center text-xs leading-5 text-ink-500"><Link to="/privacy" className="hover:text-ink-200">Конфиденциальность</Link><span className="px-2">·</span><Link to="/terms" className="hover:text-ink-200">Условия использования</Link></p>
        </div>
      </div>
    </section>
  </div>
}
