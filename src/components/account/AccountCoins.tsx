import { useCallback, useEffect, useRef, useState } from 'react'
import { Coins, RefreshCw } from 'lucide-react'
import { apiRequest } from '@/repositories/http/client'

type Entry={id:string;kind:string;delta:number;related_id:string|null;created_at:string}
type Wallet={balance:number;nominalRub:number;ledger:Entry[]}
const labels:Record<string,string>={PURCHASE:'Покупка Coins',SUPPORT:'Поддержка сервера',
  REFUND:'Возврат Coins',ADJUSTMENT:'Корректировка',AVATAR:'Аватар',LINK_SLOT:'Слот ссылки'}

export function AccountCoins() {
  const [wallet,setWallet]=useState<Wallet>(),[loading,setLoading]=useState(true),[error,setError]=useState('')
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
  const balance=wallet?.balance ?? 0
  return <section className="gs-coins-card relative overflow-hidden rounded-[22px] border p-5" aria-labelledby="account-coins-heading">
    <div className="gs-coins-glow pointer-events-none absolute -right-12 -bottom-16 h-48 w-48 rounded-full" aria-hidden />
    <div className="relative">
      <div className="flex items-center justify-between gap-3">
        <h2 id="account-coins-heading" className="flex items-center gap-2 text-[17px] font-semibold">
          <span className="gs-coin-icon grid h-9 w-9 place-items-center rounded-full"><Coins size={20}/></span>
          Мои GS Coins
        </h2>
        <button type="button" disabled={loading} onClick={()=>void load()} className="gs-account-soft-btn inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[12px] font-medium disabled:opacity-50">
          <RefreshCw size={14} className={loading?'animate-spin':''}/> Обновить баланс
        </button>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <strong className="gs-coin-balance num text-[38px] leading-none">{balance}</strong>
        <span className="pb-1 text-[17px] font-semibold">Coins</span>
      </div>
      {loading&&!wallet&&<p className="mt-3 text-sm opacity-65" role="status">Загружаем баланс…</p>}
      {error&&<p role="alert" className="mt-3 text-sm text-danger-300">{error}{wallet?' Показаны последние загруженные данные.':''}</p>}
      <p className="mt-3 max-w-md text-[12px] leading-relaxed opacity-65">1 Coin = {wallet?.nominalRub ?? 50} ₽ · без вывода и переводов. Возврат Coins ≠ возврат рублей.</p>
      {!!wallet?.ledger.length&&<details className="mt-4">
        <summary className="cursor-pointer text-[12px] font-medium opacity-75">Последние операции</summary>
        <ol className="mt-3 space-y-2">{wallet.ledger.slice(0,10).map(entry=><li key={entry.id} className="flex justify-between gap-3 border-t border-current/10 pt-2 text-[12px]">
          <span>{labels[entry.kind]??'Операция'}<span className="block text-[10px] opacity-55">{new Date(entry.created_at).toLocaleString('ru-RU')}</span></span>
          <strong className="whitespace-nowrap">{entry.delta>0?'+':''}{entry.delta} Coins</strong>
        </li>)}</ol>
      </details>}
    </div>
  </section>
}
