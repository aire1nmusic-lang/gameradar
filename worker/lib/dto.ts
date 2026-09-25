import { FRESH_MS, parseList } from './core'
import type { Row } from './store'
export const userDto=(r:Row)=>({id:r.id,displayName:r.display_name,avatarUrl:r.avatar_url??undefined,provider:r.provider,roles:parseList(r.roles),createdAt:r.created_at})
export const claimDto=(r:Row,website?:string)=>({id:r.id,serverId:r.server_id,userId:r.user_id,method:r.method,status:r.status,proofToken:r.proof_token,createdAt:r.created_at,resolvedAt:r.resolved_at??undefined,...(website?{verificationUrl:new URL('/.well-known/gamescout-verification.txt',website).toString()}:{}),expiresAt:new Date(Date.parse(r.created_at)+86400000).toISOString()})
export const voteDto=(r:Row)=>({id:r.id,serverId:r.server_id,nickname:r.nickname,status:r.status,delivery:r.delivery,createdAt:r.created_at,claimedAt:r.claimed_at??undefined,deliveredAt:r.delivered_at??undefined})
/** What players see next to the vote button — never delivery endpoints or key state. */
export const rewardDto=(r:Row)=>({serverId:r.server_id,cooldownHours:r.cooldown_hours,rewardTitle:r.reward_title??'',rewardDescription:r.reward_text??''})
export const integrationDto=(r:Row)=>({serverId:r.server_id,delivery:r.delivery,cooldownHours:r.cooldown_hours,rewardTitle:r.reward_title??'',rewardDescription:r.reward_text??'',hasApiKey:!!r.has_api_key,votifierHost:r.votifier_host??undefined,votifierPort:r.votifier_port??undefined,hasVotifierToken:!!r.votifier_token})
export function gameDto(r:Row,chronicles:Row[],versions:Row[]) {
  const children=chronicles.filter(c=>c.game_id===r.id).map(c=>({id:c.id,slug:c.slug,label:c.label,tagline:c.tagline,themeId:c.theme_id??undefined,versions:versions.filter(v=>v.chronicle_id===c.id).map(v=>v.version),serversCount:c.servers_count??0,playersOnline:c.players_online??0}))
  return {id:r.id,slug:r.slug,name:r.name,shortName:r.short_name,tagline:r.tagline,motif:r.motif,from:r.color_from,to:r.color_to,accent:r.accent,serversCount:r.servers_count??0,playersOnline:r.players_online??0,versions:[...new Set(children.flatMap(c=>c.versions))],modes:children.map(c=>c.label),chronicles:children,upcoming:!r.is_primary}
}
/** The address a player types into the game client — only for game-protocol targets, where the host is the join address. */
function connectAddress(r:Row):string|undefined {
  if(r.target_method!=='GAME_PROTOCOL'||!r.target_host)return undefined
  const port=Number(r.target_port)
  return port&&port!==25565?`${r.target_host}:${port}`:String(r.target_host)
}
export function serverDto(r:Row) {
  return {id:r.id,slug:r.slug,name:r.name,gameId:r.game_id,chronicleId:r.chronicle_id??undefined,version:r.version,modes:parseList(r.modes),summary:r.summary,description:r.description,highlights:parseList(r.highlights),tags:parseList(r.tags),rates:r.rates??undefined,hue:r.hue,logoUrl:r.logo_url??undefined,bannerUrl:r.banner_url??undefined,links:{site:r.website??'',discord:r.discord??'',telegram:r.telegram??undefined},address:connectAddress(r),region:r.region,country:r.country,flag:r.flag,languages:parseList(r.languages),online:{status:r.online_status??'PENDING',current:r.online_current??0,max:r.online_max??r.max_players??0,playersKnown:!!r.players_known,maxKnown:!!r.max_known,change24h:r.change_24h??0,peak24h:r.peak_24h??0,avg7d:r.avg_7d??0,peak30d:r.peak_30d??0,checkedAgoSec:r.checked_at?Math.max(0,Math.floor((Date.now()-Date.parse(r.checked_at))/1000)):0,source:r.source??'Ожидает проверки',method:r.online_method??'OWNER_SUBMITTED',uptime24h:r.uptime_24h??0,checksPerDay:r.checks_24h??0,note:r.online_note??undefined,sourceTier:r.source_tier??undefined,sourceUrl:r.source_url??undefined,freshness:freshness(r),observedAgoSec:ago(r.observed_at??r.checked_at)},history:{'24h':[],'7d':[],'30d':[]},rating:r.rating,reviewsCount:r.reviews_count,votes:r.votes_count,favorites:r.favorites,trendScore:organicScore(r),promo:r.promo??undefined,launch:r.launch_at&&Date.parse(r.launch_at)>Date.now()?{at:r.launch_at,type:r.launch_type??'Запуск',preRegistrations:r.launch_preregs,interestChange:0}:undefined,ownerId:r.owner_id??undefined,moderation:r.moderation,openedAt:r.opened_at??undefined,addedAt:r.added_at,updatedAt:r.updated_at,lastWipeAt:r.last_wipe_at??undefined,nextWipeAt:r.next_wipe_at??undefined,events:[],reviews:[],demo:!!r.is_demo,provenance:provenanceDto(r)}
}
/** Where an imported card's facts come from. Absent for owner-submitted cards. */
function provenanceDto(r:Row) {
  if(!r.import_key)return undefined
  let refs:{name:string;url:string}[]=[]
  try{const v=JSON.parse(String(r.source_refs??'[]'));if(Array.isArray(v))refs=v.filter(x=>x&&typeof x.name==='string'&&typeof x.url==='string').map(x=>({name:x.name,url:x.url}))}catch{}
  return {sourceName:r.source_name??undefined,sourceUrl:r.source_url??undefined,importedAt:r.imported_at??undefined,lastSourceCheckAt:r.last_source_check_at??undefined,refs}
}
const ago=(at:unknown)=>typeof at==='string'?Math.max(0,Math.floor((Date.now()-Date.parse(at))/1000)):undefined
/** fresh — observed within FRESH_MS; stale — older, never shown as current; unknown — nothing measured. */
export function freshness(r:Row):'fresh'|'stale'|'unknown' {
  const at=r.observed_at??r.checked_at
  if(!at||!r.online_status||['PENDING','UNKNOWN','CHECKING'].includes(r.online_status))return 'unknown'
  return Date.now()-Date.parse(at)<=FRESH_MS?'fresh':'stale'
}
/** Our own measurement outranks what a project or a monitor reports. */
const TRUST:Record<string,number>={VERIFIED:1,LIVE:0.6,EXTERNAL:0.4,OWNER_REPORTED:0.25}
/** Sponsored fields are intentionally absent from organic score. */
export function organicScore(r:Row) { return Math.round((r.players_known&&freshness(r)==='fresh'?Math.min(r.online_current??0,100000)*(TRUST[r.online_status]??0)/100:0)+(r.votes_count??0)*2+(r.owner_id?10:0)+(r.uptime_24h??0)/10) }
export const sampleDto=(r:Row)=>({serverId:r.server_id,at:r.at,players:r.players_known?r.players:null,status:r.status,latencyMs:r.latency_ms??undefined,sourceTier:r.source_tier??undefined,sourceName:r.source_name??undefined})
export const targetDto=(r:Row)=>({serverId:r.server_id,method:r.method,host:r.host??undefined,port:r.port??undefined,apiUrl:r.api_url??undefined,enabled:!!r.enabled})
