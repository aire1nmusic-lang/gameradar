import { useState, type ReactNode, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/controls'

type Mode='login'|'register'|'reset'
type Props={mode:Mode;setMode:(mode:Mode)=>void;email:string;setEmail:(v:string)=>void;password:string;setPassword:(v:string)=>void;name:string;setName:(v:string)=>void;busy:boolean;error:string;message:string;registrationOpen:boolean;providers:string[];submit:(e:FormEvent)=>void;confirmation:ReactNode;apiError:string}
const labels:Record<string,string>={google:'Google',discord:'Discord',vk:'VK',yandex:'Яндекс'}
// Provider silhouettes stay recognizable; the surrounding controls match the game UI.
function ProviderIcon({provider}:{provider:string}) {
  if(provider==='google') return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.04 46.98 31.87 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.88.94 7.55 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
  if(provider==='discord') return <svg aria-hidden="true" width="23" height="20" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.099.246.197.372.291a.077.077 0 0 1-.006.128c-.598.35-1.22.649-1.873.891a.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .031-.056c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.334-.956 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.334-.946 2.419-2.157 2.419Z"/></svg>
  return <span aria-hidden="true">{labels[provider]?.slice(0,1)}</span>
}
export function AccountEntry(p:Props) {
  const [visible,setVisible]=useState(false)
  const title=p.confirmation?'Подтверждение аккаунта':p.mode==='reset'?'Вернём доступ':p.mode==='register'?'Твоя история начинается здесь':'С возвращением'
  return <div className="gs-account-entry relative isolate flex min-h-[calc(100svh-60px)] items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10"><img src="/media/hub/nave-1920.webp" alt="" className="h-full w-full object-cover opacity-90"/><div className="absolute inset-0 bg-gradient-to-b from-ink-950/15 via-ink-950/20 to-ink-950/50"/></div>
    <section className="grid w-full max-w-[440px] overflow-hidden rounded-[24px] gs-account-glass">
      <div className="gs-account-body min-w-0 p-6 sm:p-10">
        <Link to="/" className="gs-account-back mb-7 inline-flex items-center gap-2 text-xs text-white/85 hover:text-white"><ArrowLeft size={14}/>В зал миров</Link>
        <p className="gs-account-eyebrow mb-2 text-xs tracking-[0.16em] text-white/85 uppercase">Аккаунт GameScout</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        <p className="gs-account-intro mt-3 text-sm leading-6 text-white/85">{p.confirmation?'Заверши действие по ссылке из письма.':p.mode==='reset'?'Отправим ссылку для нового пароля на твою почту.':p.mode==='register'?'Создай аккаунт и подтверди почту, чтобы голосовать и поддерживать серверы.':'Войди удобным способом, чтобы продолжить.'}</p>
        <div className="gs-account-actions mt-6 space-y-4">
          {p.confirmation}
          {(p.error||p.apiError)&&<p role="alert" className="rounded-xl border border-danger-400/20 bg-danger-400/5 p-3 text-sm text-danger-300">{p.error||p.apiError}</p>}
          {p.message&&<p role="status" className="rounded-xl border border-signal-400/20 bg-signal-400/5 p-3 text-sm text-signal-300">{p.message}</p>}
          {!p.confirmation&&<>
          {p.mode!=='reset'&&p.providers.length>0&&<><div className={`grid gap-2 ${p.providers.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{p.providers.map(provider=><Button key={provider} type="button" full variant="outline" disabled={p.busy||!!p.apiError} size="lg" className="gs-provider-button rounded-xl border-white/25 bg-white/10"
            onClick={()=>location.assign(`/api/v1/auth/${provider}?next=/account`)}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white shadow-[0_0_18px_rgba(255,255,255,0.12)]"><ProviderIcon provider={provider}/></span>{labels[provider]??provider}</Button>)}</div><div className="flex items-center gap-3 text-xs text-white/80"><span className="h-px flex-1 bg-white/8"/>или по почте<span className="h-px flex-1 bg-white/8"/></div></>}
          <form onSubmit={p.submit} className="gs-account-form space-y-4">
            {p.mode==='register'&&<Field label="Никнейм"><Input className="gs-account-input h-12 rounded-xl" required autoComplete="nickname" minLength={2} maxLength={40} value={p.name} onChange={e=>p.setName(e.target.value)}/></Field>}
            <Field label="Почта"><Input className="gs-account-input h-12 rounded-xl" type="email" autoComplete="email" placeholder="you@example.com" required value={p.email} onChange={e=>p.setEmail(e.target.value)}/></Field>
            {p.mode!=='reset'&&<div><div className="mb-2 flex items-center justify-between"><label htmlFor="account-password" className="text-sm text-white/80">Пароль</label>{p.mode==='login'&&<button type="button" disabled={p.busy} onClick={()=>{p.setMode('reset');p.setPassword('');setVisible(false)}} className="text-xs text-white/85 hover:text-signal-300">Забыли пароль?</button>}</div>
              <div className="relative"><Input id="account-password" className="gs-account-input h-12 rounded-xl pr-12" type={visible?'text':'password'} autoComplete={p.mode==='login'?'current-password':'new-password'} required minLength={12} maxLength={128} value={p.password} onChange={e=>p.setPassword(e.target.value)}/><button type="button" aria-label={visible?'Скрыть пароль':'Показать пароль'} aria-pressed={visible} onClick={()=>setVisible(!visible)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-white/85 hover:text-white">{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
              {p.mode==='register'&&<p className="mt-2 text-xs text-white/80">От 12 до 128 символов</p>}</div>}
            <Button type="submit" full variant="primary" size="lg" className="gs-account-submit rounded-xl" disabled={p.busy||!!p.apiError||(p.mode==='register'&&!p.registrationOpen)} iconRight={p.mode==='reset'?<Mail size={16}/>:<ArrowRight size={16}/>}>{p.busy?'Подождите…':p.mode==='login'?'Войти':p.mode==='register'?'Создать аккаунт':'Отправить ссылку'}</Button>
          </form>
          {p.mode==='reset'?<button type="button" disabled={p.busy} onClick={()=>p.setMode('login')} className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"><ArrowLeft size={14}/>Вернуться ко входу</button>:p.registrationOpen?<p className="text-center text-sm text-white/85">{p.mode==='login'?'Ещё нет аккаунта?':'Уже есть аккаунт?'} <button type="button" disabled={p.busy} onClick={()=>{p.setMode(p.mode==='login'?'register':'login');p.setPassword('');setVisible(false)}} className="text-signal-300 hover:text-white">{p.mode==='login'?'Создать':'Войти'}</button></p>:<p className="gs-account-closed rounded-xl bg-white/[0.03] p-3 text-xs leading-5 text-white/85">Регистрация пока закрыта.</p>}
          </>}
          <p className="gs-account-legal text-center text-xs leading-5 text-white/80"><Link to="/privacy" className="hover:text-white/85">Конфиденциальность</Link><span className="px-2">·</span><Link to="/terms" className="hover:text-white/85">Условия использования</Link></p>
        </div>
      </div>
    </section>
  </div>
}
