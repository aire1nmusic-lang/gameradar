import { useCallback, useEffect, useRef, useState } from 'react'
import { Coins, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/controls'
import { apiRequest } from '@/repositories/http/client'

type Entry={id:string;kind:string;delta:number;related_id:string|null;created_at:string}
type Wallet={balance:number;nominalRub:number;ledger:Entry[]}
const labels:Record<string,string>={PURCHASE:'Покупка Coins',SUPPORT:'Поддержка сервера',
  REFUND:'Возврат Coins',ADJUSTMENT:'Корректировка',AVATAR:'Аватар',LINK_SLOT:'Слот ссылки'}

type PaymentConfig={available:boolean;testOnly:boolean;realSalesEnabled:boolean}
export function AccountCoins({initiallyOpen=true}:{initiallyOpen?:boolean}) {
  const [wallet,setWallet]=useState<Wallet>(),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const [topUp,setTopUp]=useState(false),[coins,setCoins]=useState(1),[payment,setPayment]=useState<PaymentConfig>(),[paymentBusy,setPaymentBusy]=useState(false)
  const paymentKey=useRef(crypto.randomUUID())
  useEffect(()=>{let live=true;apiRequest<PaymentConfig>('/payments/test/config').then(value=>{if(live)setPayment(value)}).catch(()=>{});return()=>{live=false}},[])
  async function buyTest() {
    if(!Number.isSafeInteger(coins)||coins<1||coins>10000)return
    setPaymentBusy(true);setError('')
    try {
      const order=await apiRequest<{checkout:{action:string;fields:Record<string,string>}|null}>('/payments/test/orders',{method:'POST',headers:{'Idempotency-Key':paymentKey.current},body:JSON.stringify({coins})})
      if(!order.checkout){paymentKey.current=crypto.randomUUID();await load();return}
      const url=new URL(order.checkout.action)
      if(url.origin!=='https://auth.robokassa.ru'||order.checkout.fields.IsTest!=='1')throw new Error('Тестовая оплата недоступна.')
      const form=document.createElement('form');form.method='POST';form.action=url.href
      for(const [name,value] of Object.entries(order.checkout.fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input)}
      document.body.append(form);form.submit()
    } catch(e){setError(e instanceof Error?e.message:'Не удалось открыть тестовую оплату')}
    finally{setPaymentBusy(false)}
  }
  const generation=useRef(0)
  const load=useCallback(async()=>{
    const request=++generation.current
    setLoading(true);setError('')
    try {
      const data=await apiRequest<Wallet>('/coins/me')
      if(request===generation.current)setWallet(data)
    } catch(e) {
      if(request===generation.current)setError(e instanceof Error?e.message:'Не удалось загрузить Coins')
    } finally {if(request===generation.current)setLoading(false)}
  },[])
  useEffect(()=>{void load();return()=>{generation.current++}},[load])
  const balance=wallet?.balance
  return <details className="gs-account-wallet gs-coins-card relative overflow-hidden rounded-[22px] border" open={initiallyOpen}><summary className="flex min-h-14 items-center gap-2 px-5 py-4"><Coins size={20}/><span className="flex-1">Мои Coins</span><span className="gs-wallet-chevron" aria-hidden>⌄</span></summary><section className="px-5 pb-5" aria-label="Баланс GS Coins">
    <div className="gs-coins-glow pointer-events-none absolute -right-12 -bottom-16 h-48 w-48 rounded-full" aria-hidden />
    <div className="relative">
      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={loading} onClick={()=>void load()} className="gs-account-soft-btn inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[12px] font-medium disabled:opacity-50">
          <RefreshCw size={14} className={loading?'animate-spin':''}/> Обновить баланс
        </button>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <strong className="gs-coin-balance num text-[38px] leading-none">{balance??'—'}</strong>
        <span className="pb-1 text-[17px] font-semibold">Coins</span>
      </div>
      {loading&&!wallet&&<p className="mt-3 text-sm opacity-65" role="status">Загружаем баланс…</p>}
      {error&&<p role="alert" className="mt-3 text-sm text-danger-300">{wallet?error+' Показаны последние загруженные данные.':'Баланс временно недоступен. Попробуйте обновить позже.'}</p>}
      <p className="mt-3 max-w-md text-[12px] leading-relaxed opacity-65">1 Coin = {wallet?.nominalRub ?? 50} ₽ · без вывода и переводов. Возврат Coins ≠ возврат рублей.</p>
      <Button className="mt-4 w-full" variant="primary" aria-expanded={topUp} onClick={()=>setTopUp(!topUp)}>Пополнить баланс</Button>
      {topUp&&<div className="mt-4 space-y-3 border-t border-white/15 pt-4">
        {payment?.available&&payment.testOnly&&!payment.realSalesEnabled?<>
          <p className="text-sm">Доступна только тестовая оплата Robokassa без списания денег.</p>
          <Field label="Количество Coins"><Input type="number" min={1} max={10000} step={1} value={coins} onChange={e=>setCoins(Number(e.target.value))}/></Field>
          <p className="text-sm">{Number.isSafeInteger(coins)&&coins>0?coins*50:'—'} ₽ · тестовый платёж</p>
          <Button disabled={paymentBusy||!Number.isSafeInteger(coins)||coins<1||coins>10000} onClick={()=>void buyTest()}>Открыть тестовую оплату</Button>
        </>:<p role="status" className="text-sm">Пополнение пока недоступно: приём реальных платежей ещё не подключён. Деньги сейчас не списываются.</p>}
      </div>}
      {!!wallet?.ledger.length&&<details className="mt-4">
        <summary className="cursor-pointer text-[12px] font-medium opacity-75">Последние операции</summary>
        <ol className="mt-3 space-y-2">{wallet.ledger.slice(0,10).map(entry=><li key={entry.id} className="flex justify-between gap-3 border-t border-current/10 pt-2 text-[12px]">
          <span>{labels[entry.kind]??'Операция'}<span className="block text-[10px] opacity-55">{new Date(entry.created_at).toLocaleString('ru-RU')}</span></span>
          <strong className="whitespace-nowrap">{entry.delta>0?'+':''}{entry.delta} Coins</strong>
        </li>)}</ol>
      </details>}
    </div>
  </section></details>
}
