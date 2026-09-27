import { useEffect, useRef, useState } from 'react'
import type { GameServer } from '@/models'
import { ApiRequestError, apiRequest } from '@/repositories/http/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { TurnstileWidget } from './TurnstileWidget'

type Eligibility={eligible:boolean;used:number;limit:number;windowHours:number;captchaSiteKey:string|null}
type RankingRow={server_id:string;votes:number}
export function PrivateVotePanel({server}:{server:GameServer}) {
  const auth=useAuth(), [eligibility,setEligibility]=useState<Eligibility>(),[votes,setVotes]=useState<number>(),[position,setPosition]=useState<number>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [captchaRequired,setCaptchaRequired]=useState(false),[captcha,setCaptcha]=useState(''),[widgetKey,setWidgetKey]=useState(0)
  const key=useRef(crypto.randomUUID())
  const openedAt=useRef(Date.now())
  async function refreshRating() {
    const rows=await apiRequest<RankingRow[]>('/people-rating')
    const ranked=rows.filter(row=>row.votes>0)
    const index=ranked.findIndex(row=>row.server_id===server.id)
    setVotes(rows.find(row=>row.server_id===server.id)?.votes??0)
    setPosition(index<0?undefined:index+1)
  }
  useEffect(()=>{
    let live=true
    apiRequest<RankingRow[]>('/people-rating').then(rows=>{
      if(live) {
        const ranked=rows.filter(row=>row.votes>0)
        const index=ranked.findIndex(row=>row.server_id===server.id)
        setVotes(rows.find(row=>row.server_id===server.id)?.votes??0)
        setPosition(index<0?undefined:index+1)
      }
    }).catch(()=>{if(live)setError('Народный рейтинг сейчас недоступен')})
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
      setEligibility(updated);await refreshRating()
    } catch(e) {
      if(e instanceof ApiRequestError && e.code==='captcha_required') setCaptchaRequired(true)
      if(e instanceof ApiRequestError && e.code==='captcha_invalid') {setCaptcha('');setWidgetKey(value=>value+1)}
      setError(e instanceof Error?e.message:'Не удалось отправить голос')
    }
    finally {setBusy(false)}
  }
  return <section className="surface space-y-3 rounded-xl p-5 sm:p-6" id="vote">
    <h2 className="text-[18px]">Народный рейтинг</h2>
    <p>Голосов в текущем окне: {votes===undefined?'Загрузка…':votes}</p>
    <p className="text-[13px] text-ink-400">Позиция: {votes===undefined?'загрузка…':position===undefined?'пока не определена':`№ ${position}`}</p>
    <p className="text-[13px] text-ink-400">Рейтинг основан только на голосах подтверждённых аккаунтов. Регистрация и фильтры не доказывают уникальность человека. Поддержка за Coins на порядок здесь не влияет.</p>
    {eligibility&&<p className="text-[13px]">Правило: {eligibility.limit} {eligibility.limit===1?'голос':'голосов'} за {eligibility.windowHours} ч. · Использовано: {eligibility.used}</p>}
    {captchaRequired && (eligibility?.captchaSiteKey ?
      <TurnstileWidget key={widgetKey} siteKey={eligibility.captchaSiteKey} onToken={setCaptcha} /> :
      <p role="alert" className="text-[13px] text-ink-400">Дополнительная проверка в этом окружении не подключена.</p>)}
    {!auth.user?<Button to="/account">Войти для голосования</Button>:!auth.user.emailVerified?<Button to="/account">Подтвердить email</Button>:
      <Button disabled={busy||eligibility?.eligible===false||(captchaRequired&&!captcha)} onClick={()=>void vote()}>{eligibility?.eligible===false?'Голос уже учтён':busy?'Отправляем…':captchaRequired?'Отправить после проверки':'Голосовать'}</Button>}
    {error&&<p role="alert" className="text-danger-300">{error}</p>}
  </section>
}
