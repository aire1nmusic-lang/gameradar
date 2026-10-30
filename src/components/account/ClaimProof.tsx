import { useState } from 'react'
import { apiSend } from '@/repositories/http/client'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/controls'

type Proof={code:string;method:string;target:string;expiresAt:string}
export function ClaimProof({id,onChecked,initialMethod='SITE'}:{id:string;onChecked:()=>Promise<void>;initialMethod?:string}) {
  const [method,setMethod]=useState(initialMethod),[proof,setProof]=useState<Proof|null>(null)
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  async function run(check:boolean) {
    setBusy(true);setError('');setMessage('')
    try {
      if(check){await apiSend(`/claims/${id}/proof/check`,{});setMessage('Код найден. Окончательное решение принимает администратор.');await onChecked()}
      else {setProof(await apiSend<Proof>(`/claims/${id}/proof`,{method}));setMessage('Новый код заменил предыдущий. Он действует 4 дня; проверка заявки — до 3 дней.')}
    } catch(e){setError(e instanceof Error?e.message:'Не удалось проверить код')}
    finally{setBusy(false)}
  }
  return <div className="space-y-3 rounded-xl border border-white/10 p-3">
    <Field label="Где разместить проверочный код"><Select value={method} onChange={value=>{setMethod(value);setProof(null)}} options={[
      {value:'SITE',label:'Файл на официальном сайте'},{value:'DNS',label:'DNS TXT официального сайта'},
      {value:'MANUAL',label:'Публичный ресурс — проверка администратором'}]}/></Field>
    <Button disabled={busy} onClick={()=>void run(false)}>Получить проверочный код</Button>
    {proof&&<><p className="break-all text-sm">{proof.method==='DNS'?'Имя TXT-записи: ':proof.method==='SITE'?'Адрес файла: ':''}{proof.target==='PUBLIC_RESOURCE_ADMIN_REVIEW'?'Разместите код на уже указанном официальном сайте/Discord/Telegram и укажите ссылку в основании заявки.':proof.target}</p>
      <p className="text-sm">{proof.method==='SITE'?'В файле должна быть только эта строка.':proof.method==='DNS'?'Значение TXT — только эта строка.':'Администратор должен лично увидеть эту строку на официальном ресурсе.'}</p>
      <code className="block select-all break-all rounded bg-black/30 p-3">{proof.code}</code>
      {proof.method!=='MANUAL'&&<Button disabled={busy} onClick={()=>void run(true)}>Проверить размещение</Button>}
    </>}
    {message&&<p role="status" className="text-sm text-signal-400">{message}</p>}{error&&<p role="alert" className="text-sm text-danger-300">{error}</p>}
  </div>
}
