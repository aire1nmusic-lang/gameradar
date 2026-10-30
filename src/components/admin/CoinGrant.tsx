import { useRef, useState } from 'react'
import { apiRequest } from '@/repositories/http/client'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/controls'

export function CoinGrant({userId,onChanged}:{userId:string;onChanged:()=>void}) {
  const [coins,setCoins]=useState(''),[category,setCategory]=useState('GIFT'),[reason,setReason]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const prior=useRef<{payload:string;key:string}|undefined>(undefined)
  async function grant(){
    const body={coins:Number(coins),category,reason:reason.trim()},payload=JSON.stringify(body)
    const key=prior.current?.payload===payload?prior.current.key:crypto.randomUUID()
    prior.current={payload,key};setBusy(true);setMessage('')
    try{
      await apiRequest(`/admin/users/${encodeURIComponent(userId)}/coins/grant`,{
        method:'POST',headers:{'Idempotency-Key':key},body:payload,
      })
      setCoins('');setReason('');prior.current=undefined;setMessage('Бонусы начислены');onChanged()
    }catch(e){setMessage(e instanceof Error?e.message:'Не удалось начислить Coins')}
    finally{setBusy(false)}
  }
  const valid=Number.isSafeInteger(Number(coins))&&Number(coins)>=1&&Number(coins)<=1000&&reason.trim().length>=10
  return <details className="min-w-0 space-y-3 rounded-lg border border-white/10 p-3">
    <summary className="cursor-pointer">Начислить GS Coins</summary>
    <p className="text-xs text-ink-400">Основание видно только в административном журнале. Пользователь получает обычные Coins.</p>
    <Field label="Количество"><Input type="number" min={1} max={1000} step={1} value={coins} disabled={busy} onChange={e=>setCoins(e.target.value)}/></Field>
    <Field label="Основание"><Select value={category} disabled={busy} onChange={setCategory} options={[{value:'GIFT',label:'Подарок'},{value:'BARTER',label:'Бартер'},{value:'PROMO',label:'Промо-акция'}]}/></Field>
    <Field label="Внутренняя заметка"><Textarea minLength={10} maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></Field>
    <Button disabled={busy||!valid} onClick={()=>void grant()}>{busy?'Начисляем…':'Начислить'}</Button>
    {message&&<p role="status" className="break-words text-sm">{message}</p>}
  </details>
}
