import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiSend } from '@/repositories/http/client'
import { useSeo } from '@/lib/seo'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/controls'

export default function Copyright() {
  useSeo({title:'Правообладателям',description:'Как сообщить GameScout о спорной ссылке или описании игрового сервера.',path:'/copyright'})
  const auth=useAuth()
  const [serverId,setServerId]=useState(()=>new URLSearchParams(location.search).get('serverId')??'')
  const [materialKey,setMaterialKey]=useState('site'),[materialUrl,setMaterialUrl]=useState('')
  const [claimantName,setClaimantName]=useState(''),[contactEmail,setContactEmail]=useState('')
  const [rightsBasis,setRightsBasis]=useState(''),[workDescription,setWorkDescription]=useState(''),[evidence,setEvidence]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  async function submit(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');setMessage('')
    try {
      const result=await apiSend<{id:string;status:string;message:string}>('/copyright/claims',
        {serverId,materialKey,materialUrl,claimantName,contactEmail,rightsBasis,workDescription,evidence})
      setMessage(`${result.message} Номер обращения: ${result.id}`)
    } catch(e) {setError(e instanceof Error?e.message:'Не удалось отправить обращение')}
    finally {setBusy(false)}
  }
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-semibold">Правообладателям</h1>
    <p className="text-ink-300">Если конкретная внешняя ссылка или описание в карточке сервера затрагивает ваши права, укажите материал и основание претензии. Мы проверим полноту обращения и передадим его на ручную проверку. Спорный материал может быть временно скрыт; карточка сервера автоматически не удаляется. AI помогает распределить обращения, но не принимает окончательное юридическое решение.</p>
    <p className="text-sm text-ink-400">Форма принимает претензии к ссылкам «сайт», Discord, Telegram и к текстовому описанию сервера. Для другого материала обратитесь к администратору.</p>
    {!auth.privateCore?<p className="surface rounded-xl p-4 text-ink-400">Приём обращений в этом окружении ещё не подключён.</p>:<form onSubmit={e=>void submit(e)} className="surface space-y-4 rounded-xl p-5 sm:p-6">
      <h2 className="text-xl">Подать обращение</h2>
      <Field label="Ваше имя или организация"><Input required maxLength={120} value={claimantName} onChange={e=>setClaimantName(e.target.value)}/></Field>
      <Field label="Контактный email для уточнений"><Input type="email" required maxLength={254} value={contactEmail} onChange={e=>setContactEmail(e.target.value)}/></Field>
      <Field label="ID сервера"><Input required maxLength={100} value={serverId} onChange={e=>setServerId(e.target.value)}/></Field>
      <Field label="Спорный материал" required><Select required value={materialKey} onChange={setMaterialKey} options={[{value:'site',label:'Сайт проекта'},{value:'discord',label:'Discord'},{value:'telegram',label:'Telegram'},{value:'description',label:'Описание сервера'}]}/></Field>
      <Field label="Точный URL спорного материала"><Input type="url" required maxLength={2048} value={materialUrl} onChange={e=>setMaterialUrl(e.target.value)}/></Field>
      {materialKey==='description'&&<p className="text-xs text-ink-400">Укажите адрес страницы сервера вида https://gamescout.online/server/имя-сервера#description. Ограничение затронет только текст описания.</p>}
      <Field label="Ваши права на материал"><Textarea required minLength={20} maxLength={3000} value={rightsBasis} onChange={e=>setRightsBasis(e.target.value)}/></Field>
      <Field label="Описание защищаемого произведения"><Textarea required minLength={20} maxLength={3000} value={workDescription} onChange={e=>setWorkDescription(e.target.value)}/></Field>
      <Field label="Сведения и доказательства"><Textarea required minLength={20} maxLength={3000} value={evidence} onChange={e=>setEvidence(e.target.value)}/></Field>
      <p className="text-xs text-ink-400">Не присылайте пароли, паспортные данные или закрытые ключи. Контакт и доказательства доступны только уполномоченным администраторам.</p>
      <Button type="submit" disabled={busy}>{busy?'Отправляем…':'Отправить обращение'}</Button>
      {error&&<p role="alert" className="text-danger-300">{error}</p>}
      {message&&<p role="status" className="text-signal-400">{message}</p>}
    </form>}
  </main>
}
