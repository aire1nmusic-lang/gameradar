import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameServer } from '@/models'
import { apiRequest } from '@/repositories/http/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { plural } from '@/lib/format'

type Summary={coins:number;participants:number;recent:Array<{public_nick:string;anonymous:boolean;coins:number;created_at:string}>}
type Wallet={balance:number;nominalRub:number}
type TestPaymentConfig={available:boolean;testOnly:boolean;realSalesEnabled:boolean}
type TestOrder={checkout:{action:string;method:'POST';fields:Record<string,string>}|null}

export function SupportPanel({server}:{server:GameServer}) {
  const auth=useAuth()
  const [summary,setSummary]=useState<Summary>(),[wallet,setWallet]=useState<Wallet>()
  const [testPayment,setTestPayment]=useState(false)
  const [coins,setCoins]=useState(1),[anonymous,setAnonymous]=useState(true)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const supportKey=useRef(crypto.randomUUID()),creditKey=useRef(crypto.randomUUID()),paymentKey=useRef(crypto.randomUUID())
  const local=['127.0.0.1','localhost'].includes(window.location.hostname)
  const refresh=useCallback(async()=>{
    const [next,wallet]=await Promise.all([
      apiRequest<Summary>(`/support/servers/${encodeURIComponent(server.id)}`),
      auth.user?apiRequest<Wallet>('/coins/me'):Promise.resolve(undefined),
    ])
    setSummary(next);setWallet(wallet)
  },[server.id,auth.user?.id])
  useEffect(()=>{let live=true;Promise.all([
    apiRequest<Summary>(`/support/servers/${encodeURIComponent(server.id)}`),
    auth.user?apiRequest<Wallet>('/coins/me'):Promise.resolve(undefined),
  ]).then(([next,wallet])=>{if(live){setSummary(next);setWallet(wallet)}})
    .catch(()=>{if(live)setError('Поддержка сейчас недоступна')});return()=>{live=false}
  },[server.id,auth.user?.id])
  useEffect(()=>{apiRequest<TestPaymentConfig>('/payments/test/config').then(value=>setTestPayment(value.available&&value.testOnly&&!value.realSalesEnabled)).catch(()=>setTestPayment(false))},[])
  async function support() {
    if(!Number.isSafeInteger(coins)||coins<1||coins>10000) {setError('Укажите от 1 до 10000 Coins');return}
    setBusy(true);setError('')
    try {
      await apiRequest('/support',{method:'POST',headers:{'Idempotency-Key':supportKey.current},body:JSON.stringify({serverId:server.id,coins,anonymous})})
      supportKey.current=crypto.randomUUID()
      await refresh()
    } catch(e) {setError(e instanceof Error?e.message:'Не удалось поддержать сервер')}
    finally {setBusy(false)}
  }
  async function localCredit() {
    setBusy(true);setError('')
    try {
      await apiRequest('/__dev/coins',{method:'POST',headers:{'Idempotency-Key':creditKey.current},body:JSON.stringify({coins:10})})
      creditKey.current=crypto.randomUUID()
      await refresh()
    } catch(e) {setError(e instanceof Error?e.message:'Тестовое начисление не удалось')}
    finally {setBusy(false)}
  }
  async function buyTestCoins() {
    if(!Number.isSafeInteger(coins)||coins<1||coins>10000) {setError('Укажите от 1 до 10000 Coins');return}
    setBusy(true);setError('')
    try {
      const order=await apiRequest<TestOrder>('/payments/test/orders',{method:'POST',
        headers:{'Idempotency-Key':paymentKey.current},body:JSON.stringify({coins})})
      paymentKey.current=crypto.randomUUID()
      if(!order.checkout) {await refresh();setError('Тестовый заказ уже оплачен');setBusy(false);return}
      const form=document.createElement('form');form.method=order.checkout.method;form.action=order.checkout.action
      for(const [name,value] of Object.entries(order.checkout.fields)) {
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input)
      }
      document.body.append(form);form.submit()
    } catch(e) {setError(e instanceof Error?e.message:'Не удалось создать тестовый заказ');setBusy(false)}
  }
  return <section className="surface space-y-3 rounded-xl p-5 sm:p-6" id="support">
    <h2 className="text-[18px]">Поддержка</h2>
    <p className="text-[15px]">Поддержка: <strong>{summary?.coins ?? '—'}</strong> · {summary?.participants ?? '—'} {summary ? plural(summary.participants, ['участник', 'участника', 'участников']) : 'участников'}</p>
    <p className="text-[13px] text-ink-400">Отдельная сортировка за GS Coins. Карточки одинаковые; поддержка не влияет на Народный рейтинг. Номинал: 1 Coin = 50 ₽.</p>
    {summary?.recent.length ? <div className="space-y-1 border-t border-white/7 pt-3">
      <h3 className="text-[13px] text-ink-300">Последние поддержавшие</h3>
      {summary.recent.map((item,index)=><div key={`${item.created_at}-${index}`} className="flex justify-between gap-3 text-[13px]">
        <span className="truncate">{item.anonymous?'Анонимно':item.public_nick}</span><span className="num shrink-0">{item.coins} Coins</span>
      </div>)}
    </div> : <p className="text-[13px] text-ink-400">Поддержавших пока нет.</p>}
    {!auth.user ? <Button to="/account">Войти для поддержки</Button> : !auth.user.emailVerified ?
      <Button to="/account">Подтвердить email</Button> : <div className="space-y-3 border-t border-white/7 pt-3">
      <p className="text-[13px]">Ваш баланс: <strong>{wallet?.balance ?? '…'} GS Coins</strong></p>
      <label className="flex items-center gap-2 text-[13px]">Coins
        <input type="number" min={1} max={10000} step={1} value={coins} onChange={event=>setCoins(Number(event.target.value))}
          className="w-24 rounded-md border border-white/15 bg-ink-900 px-2 py-1 text-ink-50" />
      </label>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={anonymous} onChange={event=>setAnonymous(event.target.checked)} />Показывать меня анонимно</label>
      <Button disabled={busy||wallet===undefined||wallet.balance<coins} onClick={()=>void support()}>{busy?'Обрабатываем…':'Поддержать сервер'}</Button>
      {testPayment&&<div className="rounded-md border border-white/10 bg-white/[0.025] p-3 text-[12px] text-ink-400">
        Robokassa: только тестовая оплата без списания денег. {coins} Coins — {coins*50} ₽ по номиналу, без скидок.
        <Button variant="outline" className="mt-2" disabled={busy} onClick={()=>void buyTestCoins()}>Открыть тестовую оплату</Button>
      </div>}
      {local && <div className="rounded-md border border-white/10 bg-white/[0.025] p-3 text-[12px] text-ink-400">
        Локальный стенд: тестовое начисление — не покупка и не платёж.
        <Button variant="outline" className="mt-2" disabled={busy} onClick={()=>void localCredit()}>Начислить 10 тестовых Coins</Button>
      </div>}
    </div>}
    {error&&<p role="alert" className="text-[13px] text-danger-300">{error}</p>}
  </section>
}
