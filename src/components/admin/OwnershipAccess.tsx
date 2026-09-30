import { useState } from 'react'
import { apiRequest, apiSend } from '@/repositories/http/client'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/controls'

type Server = { server_id:string; game_id:string; name:string }
type Claim = Server & { id:string; evidence:string }
type Access = { status:'PLAYER'|'OWNER'; owned:Server[]; pending:Claim[]; emailVerified:boolean; banned:boolean }

export function OwnershipAccess({userId,self,onChanged}:{userId:string;self:boolean;onChanged:()=>void}) {
  const [open,setOpen]=useState(false),[access,setAccess]=useState<Access>()
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const [reasons,setReasons]=useState<Record<string,string>>({})
  const path=`/admin/users/${encodeURIComponent(userId)}/ownership`
  async function refresh() {setAccess(await apiRequest<Access>(path))}
  async function toggle() {
    if(open){setOpen(false);return}
    setOpen(true);setError('')
    try {await refresh()} catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить права')}
  }
  async function decide(key:string,request:()=>Promise<unknown>) {
    setBusy(true);setError('');setMessage('')
    try {
      await request();await refresh();onChanged();setReasons(previous=>({...previous,[key]:''}))
      setMessage('Решение сохранено в журнале. Права в аккаунте обновились.')
    } catch(e){setError(e instanceof Error?e.message:'Не удалось изменить доступ')}
    finally{setBusy(false)}
  }
  const reason=(key:string)=>reasons[key]??''
  const reasonField=(key:string,label:string)=><Textarea aria-label={label} minLength={10} maxLength={1000}
    value={reason(key)} onChange={e=>setReasons(previous=>({...previous,[key]:e.target.value}))}/>
  return <div className="space-y-3">
    <Button variant="outline" size="sm" aria-expanded={open} onClick={()=>void toggle()}>
      {open?'Скрыть статус ЛК':'Изменить статус ЛК'}
    </Button>
    {open&&<div className="space-y-3 rounded-lg border border-white/10 p-3">
      {error&&<p role="alert" className="text-danger-300">{error}</p>}
      {message&&<p role="status" className="text-signal-400">{message}</p>}
      {!access&&!error&&<p>Загружаем права…</p>}
      {access&&<>
        <p><strong>Статус: {access.status==='OWNER'?'Игрок и владелец':'Игрок'}</strong>
          {' · '}Подтверждённых серверов: {access.owned.length}</p>
        <p className="text-ink-400">Права владельца выдаются только по конкретному серверу после вашего решения по Claim. Глобальный доступ ко всем серверам не выдаётся.</p>
        {!access.pending.length&&<p className="text-ink-400">Заявок на подтверждение сейчас нет.</p>}
        {access.pending.map(claim=><div key={claim.id} className="space-y-2 border-t border-white/10 pt-3">
          <p><strong>Заявка: {claim.name}</strong> · {claim.game_id} · {claim.server_id}</p>
          <p className="whitespace-pre-wrap break-words">{claim.evidence}</p>
          {reasonField(claim.id,`Основание решения по ${claim.name}`)}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy||self||access.banned||!access.emailVerified||reason(claim.id).trim().length<10}
              onClick={()=>void decide(claim.id,()=>apiSend(`/admin/claims/${encodeURIComponent(claim.id)}/resolve`,{status:'VERIFIED',reason:reason(claim.id)}))}>
              Подтвердить · статус владельца</Button>
            <Button size="sm" variant="outline" disabled={busy||self||reason(claim.id).trim().length<10}
              onClick={()=>void decide(claim.id,()=>apiSend(`/admin/claims/${encodeURIComponent(claim.id)}/resolve`,{status:'REJECTED',reason:reason(claim.id)}))}>
              Отклонить · оставить игроком</Button>
          </div>
          {(!access.emailVerified||access.banned)&&<p className="text-ink-400">Для подтверждения нужен активный аккаунт с подтверждённым email.</p>}
        </div>)}
        {access.owned.map(server=>{const key=`revoke:${server.server_id}`;return <div key={key} className="space-y-2 border-t border-white/10 pt-3">
          <p><strong>{server.name}</strong> · {server.game_id} · статус владельца действует</p>
          {reasonField(key,`Основание снятия прав на ${server.name}`)}
          <Button size="sm" variant="outline" disabled={busy||self||reason(key).trim().length<10}
            onClick={()=>void decide(key,()=>apiSend(path,{action:'REVOKE',serverId:server.server_id,reason:reason(key)}))}>
            Снять права на этот сервер</Button>
        </div>})}
      </>}
    </div>}
  </div>
}
