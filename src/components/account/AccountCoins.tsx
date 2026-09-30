import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '@/repositories/http/client'
import { Button } from '@/components/ui/Button'

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
  return <section className="surface space-y-3 rounded-xl p-5" aria-labelledby="account-coins-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="account-coins-heading" className="text-lg font-semibold">Мои GS Coins</h2>
      <Button variant="outline" disabled={loading} onClick={()=>void load()}>Обновить баланс</Button>
    </div>
    {loading&&<p role="status">Загружаем баланс и операции…</p>}
    {error&&<p role="alert" className="text-danger-300">{error}{wallet?' Показаны последние загруженные данные.':''}</p>}
    {wallet&&<>
      <p>Баланс: <strong>{wallet.balance} Coins</strong></p>
      <p className="text-sm text-ink-400">Номинал: 1 Coin = {wallet.nominalRub} ₽. Coins нельзя вывести или передать другому аккаунту. Возврат Coins в истории не означает возврат рублей.</p>
      <h3 className="font-medium">Последние операции</h3>
      {!wallet.ledger.length?<p className="text-ink-400">Операций пока нет.</p>:<ol className="space-y-2">{wallet.ledger.map(entry=><li key={entry.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-white/10 pt-2 text-sm">
        <span>{labels[entry.kind]??'Операция'}<span className="block text-xs text-ink-400">{new Date(entry.created_at).toLocaleString('ru-RU')}</span></span>
        <span className="whitespace-nowrap">{entry.delta>0?'+':''}{entry.delta} Coins</span>
      </li>)}</ol>}
      {wallet.ledger.length===100&&<p className="text-xs text-ink-400">Показаны последние 100 операций.</p>}
    </>}
  </section>
}
