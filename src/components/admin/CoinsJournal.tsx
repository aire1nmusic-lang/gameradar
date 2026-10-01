import { useEffect, useState } from 'react'
import { apiRequest } from '@/repositories/http/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/controls'

type Entry={id:string;user_id:string;kind:string;delta:number;related_id:string|null;details:unknown;created_at:string}
type Journal={items:Entry[];total:number;page:number;pageSize:number}
type Report={status:string;total:number;counts:Record<string,number>;samples:{category:string;ref:string}[];checkedAt:string}
export function CoinsJournal() {
  const [userId,setUserId]=useState(''),[relatedId,setRelatedId]=useState(''),[kind,setKind]=useState('')
  const [query,setQuery]=useState('page=1'),[data,setData]=useState<Journal>(),[report,setReport]=useState<Report>()
  const [error,setError]=useState(''),[loading,setLoading]=useState(false)
  useEffect(()=>{let live=true;setLoading(true);setError('')
    void Promise.all([apiRequest<Journal>(`/admin/coins/journal?${query}`),apiRequest<Report>('/admin/coins/integrity')])
      .then(([d,r])=>{if(live){setData(d);setReport(r)}}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Журнал недоступен')})
      .finally(()=>{if(live)setLoading(false)})
    return ()=>{live=false}
  },[query])
  const load=(page:number)=>setQuery(new URLSearchParams({userId,relatedId,kind,page:String(page)}).toString())
  return <section className="space-y-3" aria-label="Журнал Coins">
    <p className="text-sm text-ink-400">Все начисления и списания сохраняются. Исправления — отдельными операциями. Основания бонусов видны только сотрудникам с доступом к Coins.</p>
    {report&&<article className="surface space-y-2 rounded-xl p-4 text-sm"><strong>Сверка: {report.status==='OK'?'расхождений нет':`требует проверки (${report.total})`}</strong>
      <p>{new Date(report.checkedAt).toLocaleString('ru-RU')} · автоматическая проверка каждые 5 минут</p>
      {report.total>0&&<pre className="overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({counts:report.counts,samples:report.samples},null,2)}</pre>}
      <p className="text-ink-400">Сверка проверяет целостность учета. Она не доказывает отсутствие мошенничества. AI-анализ пока не подключён.</p>
    </article>}
    <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();load(1)}}>
      <Input className="min-w-0" aria-label="ID пользователя" placeholder="ID пользователя" value={userId} onChange={e=>setUserId(e.target.value)}/>
      <Input className="min-w-0" aria-label="ID связанной операции" placeholder="ID Поддержки или заказа" value={relatedId} onChange={e=>setRelatedId(e.target.value)}/>
      <select aria-label="Тип операции" className="surface rounded-lg p-2" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Все операции</option>{['PURCHASE','SUPPORT','AVATAR','LINK_SLOT','REFUND','ADJUSTMENT'].map(k=><option key={k}>{k}</option>)}</select>
      <Button disabled={loading}>Найти</Button>
    </form>
    {error&&<p role="alert">{error}</p>}{loading?<p>Загрузка…</p>:data&&<>
      <p>Операций: {data.total} · страница {data.page}</p>
      {!data.items.length&&<p>Операций по этому фильтру нет.</p>}
      {data.items.map(row=><article key={row.id} className="surface space-y-2 rounded-xl p-4 text-sm break-words"><strong>{row.kind} · {row.delta>0?'+':''}{row.delta} Coins</strong>
        <p>{new Date(row.created_at).toLocaleString('ru-RU')}</p><p className="break-all">ID {row.id} · пользователь {row.user_id} · связь {row.related_id??'—'}</p>
        <details><summary>Детали операции</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(row.details,null,2)}</pre></details>
      </article>)}
      <div className="flex gap-2"><Button variant="outline" disabled={data.page<=1} onClick={()=>load(data.page-1)}>Назад</Button><Button variant="outline" disabled={data.page*data.pageSize>=data.total} onClick={()=>load(data.page+1)}>Далее</Button></div>
    </>}
  </section>
}
