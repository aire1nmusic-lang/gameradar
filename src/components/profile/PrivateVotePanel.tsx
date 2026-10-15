import { useEffect, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import { serverArt } from '@/data/themeMedia'
import { WorldArtSurface } from '@/components/media/WorldArt'
import type { GameServer } from '@/models'
import { ApiRequestError, apiRequest } from '@/repositories/http/client'
import { useAuth } from '@/hooks/useAuth'
import { readPeopleRanking } from '@/services/publicRanking'
import { invalidateDiscoveryCache } from '@/services/catalogService'
import { Button } from '@/components/ui/Button'
import { TurnstileWidget } from './TurnstileWidget'

type Eligibility={eligible:boolean;used:number;limit:number;windowHours:number;captchaSiteKey:string|null}
export function PrivateVotePanel({server,anchor=true}:{server:GameServer;anchor?:boolean}) {
  const auth=useAuth(), [eligibility,setEligibility]=useState<Eligibility>(),[votes,setVotes]=useState<number>(),[position,setPosition]=useState<number>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [captchaRequired,setCaptchaRequired]=useState(false),[captcha,setCaptcha]=useState(''),[widgetKey,setWidgetKey]=useState(0)
  const key=useRef(crypto.randomUUID())
  const openedAt=useRef(Date.now())
  async function refreshRating() {
    const rows=await readPeopleRanking()
    setError('')
    const ranked=rows.filter(row=>row.votes>0)
    const index=ranked.findIndex(row=>row.server_id===server.id)
    setVotes(rows.find(row=>row.server_id===server.id)?.votes??0)
    setPosition(index<0?undefined:index+1)
  }
  useEffect(()=>{
    let live=true
    setVotes(undefined);setPosition(undefined);setError('')
    readPeopleRanking().then(rows=>{
      if(live) {
        const ranked=rows.filter(row=>row.votes>0)
        const index=ranked.findIndex(row=>row.server_id===server.id)
        setVotes(rows.find(row=>row.server_id===server.id)?.votes??0)
        setPosition(index<0?undefined:index+1)
      }
    }).catch(()=>{if(live)setError('Голоса игроков сейчас недоступны')})
    if(auth.user && auth.user.emailVerified) apiRequest<Eligibility>(`/people-rating/eligibility?serverId=${encodeURIComponent(server.id)}`)
      .then(value=>{if(live)setEligibility(value)}).catch(()=>{})
    return ()=>{live=false}
  },[server.id,auth.user?.id,auth.user?.emailVerified])
  async function vote() {
    setBusy(true);setError('')
    try {
      let deviceSignal=sessionStorage.getItem('gs_vote_device')
      if(!deviceSignal) {deviceSignal=crypto.randomUUID();sessionStorage.setItem('gs_vote_device',deviceSignal)}
      await apiRequest('/people-rating/votes',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.current},
        body:JSON.stringify({serverId:server.id,deviceSignal,pageAgeMs:Math.min(86400000,Date.now()-openedAt.current),...(captcha?{captcha}:{})})})
      key.current=crypto.randomUUID()
      setCaptchaRequired(false);setCaptcha('')
      const updated=await apiRequest<Eligibility>(`/people-rating/eligibility?serverId=${encodeURIComponent(server.id)}`)
      setEligibility(updated);invalidateDiscoveryCache();await refreshRating()
    } catch(e) {
      if(e instanceof ApiRequestError && e.code==='captcha_required') setCaptchaRequired(true)
      if(e instanceof ApiRequestError && e.code==='captcha_invalid') {setCaptcha('');setWidgetKey(value=>value+1)}
      setError(e instanceof Error?e.message:'Не удалось отправить голос')
    }
    finally {setBusy(false)}
  }
  return <section id={anchor?"vote":undefined} className="gs-vote-panel relative isolate space-y-3 overflow-hidden rounded-2xl border p-4 sm:p-6"
    style={{ borderColor: 'color-mix(in oklab, var(--gt-primary) 42%, transparent)', background: 'linear-gradient(140deg, color-mix(in oklab, var(--gt-primary) 16%, var(--color-ink-900)), var(--color-ink-900) 72%)' }}>
    <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.22] [mask-image:linear-gradient(to_left,#000,transparent_75%)]"><WorldArtSurface art={serverArt(server)} scrim="none" sizes="500px" width={800} /></span>
    <div className="flex items-center gap-2 text-[11.5px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--gt-primary)' }}><Trophy size={14} /> Выбор игроков</div>
    <div className="flex items-end gap-6">
      <div><div className="num font-display text-[44px] leading-none font-semibold text-ink-50">{votes===undefined?'…':votes}</div><div className="mt-1.5 text-[12.5px] text-ink-300">голосов игроков</div></div>
      <div><div className="num font-display text-[44px] leading-none font-semibold" style={{ color: position!==undefined&&position<=3 ? 'var(--gt-primary)' : undefined }}>{votes===undefined?'…':position===undefined?'—':'№'+position}</div><div className="mt-1.5 text-[12.5px] text-ink-300">{position===undefined?'позиция появится после первых голосов':'место в рейтинге'}</div></div>
    </div>
    {eligibility&&<p className="text-[13px]">Правило: {eligibility.limit} {eligibility.limit===1?'голос':'голосов'} за {eligibility.windowHours} ч. · Использовано: {eligibility.used}</p>}
    {captchaRequired && (eligibility?.captchaSiteKey ?
      <TurnstileWidget key={widgetKey} siteKey={eligibility.captchaSiteKey} onToken={setCaptcha} /> :
      <p role="alert" className="text-[13px] text-ink-400">Дополнительная проверка в этом окружении не подключена.</p>)}
    {!auth.user?(auth.registrationOpen?<Button variant="primary" full to="/account">Войти для голосования</Button>:<p className="text-[13px] text-ink-400">Голосование откроется вместе с регистрацией.</p>):!auth.user.emailVerified?<Button variant="primary" full to="/account">Подтвердить email</Button>:
      <Button variant="primary" full disabled={busy||eligibility?.eligible===false||(captchaRequired&&!captcha)} onClick={()=>void vote()}>{eligibility?.eligible===false?'Голос уже учтён':busy?'Отправляем…':captchaRequired?'Отправить после проверки':'Голосовать'}</Button>}
    {error&&<p role="alert" className="text-danger-300">{error}</p>}
  </section>
}
