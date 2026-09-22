import { badRequest, devOrigins, type Env } from './core'
import type { Filters } from './store'
export function object(value:unknown): Record<string,unknown> { if(!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('Ожидается JSON объект');return value as Record<string,unknown> }
export function text(value:unknown,name:string,min=0,max=200):string { if(typeof value !== 'string') throw badRequest(`${name}: ожидается строка`);const v=value.trim();if(v.length<min || v.length>max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)) throw badRequest(`${name}: длина ${min}–${max} символов`);return v }
export function strings(value:unknown,name:string,max=10):string[] { if(!Array.isArray(value) || value.length>max)throw badRequest(`${name}: ожидается массив до ${max} элементов`);return [...new Set(value.map(v=>text(v,name,1,80)))] }
export function integer(value:unknown,name:string,min:number,max:number):number { const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw badRequest(`${name}: число от ${min} до ${max}`);return n }
export function website(value:unknown,env:Env):string { const raw=text(value,'website',8,500);let url:URL;try{url=new URL(raw)}catch{throw badRequest('Некорректный URL сайта')};if(url.username||url.password||url.hash)throw badRequest('URL не должен содержать credentials или fragment');if(url.protocol!=='https:'&&!devOrigins(env).includes(url.origin))throw badRequest('Сайт должен использовать HTTPS');if(url.protocol==='https:' && (url.hostname==='localhost'||url.hostname.endsWith('.localhost')||!url.hostname.includes('.')||url.hostname.startsWith('[')||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)))throw badRequest('Требуется публичное доменное имя сайта');return url.toString() }
export function serverInput(value:unknown,env:Env,partial=false):Record<string,unknown> {
  const b=object(value);const out:Record<string,unknown>={}
  for(const key of ['ownerId','owner_id','submitted_by','moderation','status','online','rating','votes','votes_count','addedAt','updatedAt','promo','demo'])if(key in b)throw badRequest(`${key} задаётся только backend`)
  if(!partial||b.name!==undefined)out.name=text(b.name,'name',3,120)
  if(!partial||b.gameId!==undefined)out.game_id=text(b.gameId,'gameId',1,80)
  if(b.chronicleId!==undefined)out.chronicle_id=text(b.chronicleId,'chronicleId',1,100)
  if(!partial||b.description!==undefined)out.description=text(b.description,'description',10,10000)
  if(b.summary!==undefined)out.summary=text(b.summary,'summary',0,300)
  else if(!partial)out.summary=String(out.description).slice(0,180)
  const links=b.links===undefined?{}:object(b.links)
  if(!partial||b.website!==undefined||links.site!==undefined)out.website=website(b.website??links.site,env)
  if(b.version!==undefined)out.version=text(b.version,'version',0,80)
  if(b.country!==undefined)out.country=text(b.country,'country',1,80)
  else if(!partial)throw badRequest('country обязателен')
  if(b.region!==undefined)out.region=text(b.region,'region',0,80)
  if(b.languages!==undefined)out.languages=JSON.stringify(strings(b.languages,'languages'))
  else if(b.language!==undefined)out.languages=JSON.stringify([text(b.language,'language',1,80)])
  else if(!partial)throw badRequest('language обязателен')
  for(const field of ['modes','highlights','tags'])if(b[field]!==undefined)out[field]=JSON.stringify(strings(b[field],field))
  if(b.rates!==undefined)out.rates=text(b.rates,'rates',0,80)
  for(const field of ['discord','telegram'])if(links[field]!==undefined)out[field]=website(links[field],env)
  return out
}
export function filters(params:URLSearchParams):Filters {
  const q:Filters={limit:integer(params.get('limit')??24,'limit',1,100),offset:integer(params.get('offset')??0,'offset',0,100000)}
  for(const key of ['query','gameId','chronicleId'] as const)if(params.has(key))q[key]=text(params.get(key),key,0,120)
  for(const key of ['gameIds','versions','modes','regions','languages'] as const)if(params.has(key)){const raw=params.getAll(key).flatMap(x=>x.startsWith('[')?(()=>{try{return JSON.parse(x)}catch{throw badRequest(`${key}: неверный JSON`)}})():x.split(','));q[key]=strings(raw,key,20)}
  for(const key of ['verifiedOnly','hideOffline','wipeSoon','onlyLaunching'] as const)if(params.has(key)){const v=params.get(key);if(v!=='true'&&v!=='false')throw badRequest(`${key}: true или false`);q[key]=v==='true'}
  if(params.has('minOnline'))q.minOnline=integer(params.get('minOnline'),'minOnline',0,10000000)
  if(params.has('minRating')){const v=Number(params.get('minRating'));if(!Number.isFinite(v)||v<0||v>5)throw badRequest('minRating: 0–5');q.minRating=v}
  if(params.has('sort')){const v=params.get('sort')!;if(!['recommended','online','growth','rating','new','launch','votes'].includes(v))throw badRequest('Неизвестная сортировка');q.sort=v}
  if(params.has('openedWithin')){const v=params.get('openedWithin')!;if(!['any','30d','90d','365d'].includes(v))throw badRequest('Неизвестный период');q.openedWithin=v}
  return q
}
