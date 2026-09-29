import { assertPort, assertPublicHost, assertPublicUrl } from '../adapters/network.ts'

export type PublicMonitoring = {enabled:false} | {enabled:true;method:'GAME_PROTOCOL'|'LOGIN_SERVER';host:string;port?:number} | {enabled:true;method:'SERVER_API';apiUrl:string;expectName:string}
export type PublicSnapshot = { serverId: string; version: number; claimed: boolean; restrictedLinks?: Array<'site'|'discord'|'telegram'>; restrictedMaterials?: Array<'description'>; summary?: string; facts?: Partial<Record<'version'|'rates'|'region'|'openedAt'|'country',string>> & {modes?:string[]}; links?: Partial<Record<'site'|'discord'|'telegram',string>>; monitoring?:PublicMonitoring; supportCoins?: number; supportParticipants?: number }
export function parsePublicSnapshot(value: unknown): PublicSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_projection')
  const row=value as Record<string,unknown>
  if (Object.keys(row).some(key=>!['claimed','serverId','version','restrictedLinks','restrictedMaterials','summary','facts','links','monitoring','supportCoins','supportParticipants'].includes(key))
    || !['claimed','serverId','version'].every(key=>Object.hasOwn(row,key))
    || typeof row.serverId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.serverId)
    || !Number.isSafeInteger(row.version) || Number(row.version)<1 || typeof row.claimed!=='boolean') throw new Error('invalid_projection')
  if(row.restrictedLinks!==undefined && (!Array.isArray(row.restrictedLinks)
    || row.restrictedLinks.length>3 || new Set(row.restrictedLinks).size!==row.restrictedLinks.length
    || row.restrictedLinks.some(key=>!['site','discord','telegram'].includes(key)))) throw new Error('invalid_projection')
  if(row.restrictedMaterials!==undefined && (!Array.isArray(row.restrictedMaterials)
    || row.restrictedMaterials.length>1 || new Set(row.restrictedMaterials).size!==row.restrictedMaterials.length
    || row.restrictedMaterials.some(key=>key!=='description'))) throw new Error('invalid_projection')
  if(row.summary!==undefined && (typeof row.summary!=='string'||row.summary.length<20||row.summary.length>280
    || /[<>\u0000-\u001f]|\b(?:https?:\/\/|www\.)|\[[^\]]+\]\(/i.test(row.summary))) throw new Error('invalid_projection')
  if(row.facts!==undefined) {
    if(!row.facts||typeof row.facts!=='object'||Array.isArray(row.facts))throw new Error('invalid_projection')
    for(const [key,value] of Object.entries(row.facts)) {
      if(key==='modes') {
        if(!Array.isArray(value)||value.length<1||value.length>5||value.some(mode=>typeof mode!=='string'||mode.length<1||mode.length>30
          || /[<>\u0000-\u001f]|\b(?:https?:\/\/|www\.)/i.test(mode))||new Set(value.map(mode=>mode.toLowerCase())).size!==value.length)throw new Error('invalid_projection')
        continue
      }
      if(!['version','rates','region','openedAt','country'].includes(key)||typeof value!=='string'||value.length<1||value.length>80
        || /[<>\u0000-\u001f]|\b(?:https?:\/\/|www\.)/i.test(value))throw new Error('invalid_projection')
      if(key==='openedAt' && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        ||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value))throw new Error('invalid_projection')
    }
  }
  if(row.links!==undefined) {
    if(!row.links||typeof row.links!=='object'||Array.isArray(row.links))throw new Error('invalid_projection')
    for(const [key,value] of Object.entries(row.links)) {
      if(!['site','discord','telegram'].includes(key)||typeof value!=='string'||value.length>500)throw new Error('invalid_projection')
      if(value==='')continue
      let url:URL
      try {url=new URL(value)}catch{throw new Error('invalid_projection')}
      const host=url.hostname.toLowerCase().replace(/\.$/,'')
      if(url.protocol!=='https:'||url.username||url.password||url.hash||!host.includes('.')
        ||host==='localhost'||/\.(?:localhost|local|internal|lan|test)$/.test(host)
        ||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.startsWith('['))throw new Error('invalid_projection')
    }
  }
  if(row.monitoring!==undefined) {
    const target=row.monitoring as Record<string,unknown>
    if(!target||typeof target!=='object'||Array.isArray(target)||typeof target.enabled!=='boolean')throw new Error('invalid_projection')
    if(target.enabled===false) {
      if(Object.keys(target).length!==1)throw new Error('invalid_projection')
    } else {
      try {
        if(target.method==='SERVER_API') {
          if(Object.keys(target).some(key=>!['enabled','method','apiUrl','expectName'].includes(key))
            ||typeof target.apiUrl!=='string'||target.apiUrl.length>500
            ||typeof target.expectName!=='string'||target.expectName.length<1||target.expectName.length>100)throw new Error('invalid_projection')
          const url=assertPublicUrl(target.apiUrl)
          if(url.pathname!=='/'||url.search||/(^|\.)(cfx\.re|fivem\.net|cfx-services\.net)$/i.test(url.hostname))throw new Error('invalid_projection')
        } else if(target.method==='GAME_PROTOCOL'||target.method==='LOGIN_SERVER') {
          if(Object.keys(target).some(key=>!['enabled','method','host','port'].includes(key))
            ||typeof target.host!=='string')throw new Error('invalid_projection')
          assertPublicHost(target.host)
          if(target.port!==undefined) {
            if(typeof target.port!=='number')throw new Error('invalid_projection')
            assertPort(target.port)
          }
          if(target.method==='LOGIN_SERVER'&&target.port===undefined)throw new Error('invalid_projection')
        } else throw new Error('invalid_projection')
      } catch {throw new Error('invalid_projection')}
    }
  }
  for(const amount of [row.supportCoins,row.supportParticipants])
    if(amount!==undefined&&(!Number.isSafeInteger(amount)||Number(amount)<0))throw new Error('invalid_projection')
  if((row.supportCoins===undefined)!==(row.supportParticipants===undefined))throw new Error('invalid_projection')
  return row as PublicSnapshot
}
export const projectionSql = `INSERT INTO public_server_projection(server_id,version,claimed,restricted_links,restricted_materials,support_coins,support_participants,received_at,apply_token) VALUES(?,?,?,?,?,?,?,?,?)
  ON CONFLICT(server_id) DO UPDATE SET version=excluded.version,claimed=excluded.claimed,
    restricted_links=excluded.restricted_links,restricted_materials=excluded.restricted_materials,support_coins=excluded.support_coins,
    support_participants=excluded.support_participants,received_at=excluded.received_at,apply_token=excluded.apply_token
  WHERE excluded.version>public_server_projection.version`
export async function applyPublicSnapshot(db:D1Database,payload:PublicSnapshot) {
  const receivedAt=new Date().toISOString()
  const applyToken=crypto.randomUUID()
  const currentAttempt=`AND (SELECT apply_token FROM public_server_projection WHERE server_id=?)=?`
  const writes=[db.prepare(projectionSql).bind(payload.serverId,payload.version,payload.claimed?1:0,
    JSON.stringify(payload.restrictedLinks??[]),JSON.stringify(payload.restrictedMaterials??[]),
    payload.supportCoins??0,payload.supportParticipants??0,receivedAt,applyToken)]
  if(payload.summary!==undefined)writes.push(db.prepare(`UPDATE servers SET summary=?,updated_at=? WHERE id=?
    AND (SELECT version FROM public_server_projection WHERE server_id=?)=? ${currentAttempt}`)
    .bind(payload.summary,receivedAt,payload.serverId,payload.serverId,payload.version,payload.serverId,applyToken))
  for(const [field,column] of Object.entries({version:'version',rates:'rates',region:'region',openedAt:'opened_at',country:'country'})) {
    const value=payload.facts?.[field as keyof NonNullable<PublicSnapshot['facts']>]
    if(value!==undefined)writes.push(db.prepare(`UPDATE servers SET ${column}=?,updated_at=? WHERE id=?
      AND (SELECT version FROM public_server_projection WHERE server_id=?)=? ${currentAttempt}`)
      .bind(value,receivedAt,payload.serverId,payload.serverId,payload.version,payload.serverId,applyToken))
  }
  if(payload.facts?.modes)writes.push(db.prepare(`UPDATE servers SET modes=?,updated_at=? WHERE id=?
    AND (SELECT version FROM public_server_projection WHERE server_id=?)=? ${currentAttempt}`)
    .bind(JSON.stringify(payload.facts.modes),receivedAt,payload.serverId,payload.serverId,payload.version,payload.serverId,applyToken))
  for(const [field,column] of Object.entries({site:'website',discord:'discord',telegram:'telegram'})) {
    const value=payload.links?.[field as keyof NonNullable<PublicSnapshot['links']>]
    if(value!==undefined)writes.push(db.prepare(`UPDATE servers SET ${column}=?,updated_at=? WHERE id=?
      AND (SELECT version FROM public_server_projection WHERE server_id=?)=? ${currentAttempt}`)
      .bind(value||null,receivedAt,payload.serverId,payload.serverId,payload.version,payload.serverId,applyToken))
  }
  if(payload.monitoring) {
    if(payload.monitoring.enabled) {
      const target=payload.monitoring
      writes.push(db.prepare(`INSERT INTO monitoring_targets(server_id,method,host,port,api_url,expect_name,enabled,agent_token)
        SELECT ?,?,?,?,?,?,1,NULL WHERE (SELECT version FROM public_server_projection WHERE server_id=?)=? ${currentAttempt}
        ON CONFLICT(server_id) DO UPDATE SET method=excluded.method,host=excluded.host,port=excluded.port,
        api_url=excluded.api_url,expect_name=excluded.expect_name,enabled=1,agent_token=NULL`)
        .bind(payload.serverId,target.method,'host' in target?target.host:null,
          'port' in target?target.port??null:null,'apiUrl' in target?target.apiUrl:null,
          'expectName' in target?target.expectName:null,payload.serverId,payload.version,payload.serverId,applyToken))
    } else writes.push(db.prepare(`UPDATE monitoring_targets SET enabled=0 WHERE server_id=?
      AND (SELECT version FROM public_server_projection WHERE server_id=?)=? ${currentAttempt}`)
      .bind(payload.serverId,payload.serverId,payload.version,payload.serverId,applyToken))
    writes.push(db.prepare(`UPDATE server_online SET status='UNKNOWN',current=0,players_known=0,max_known=0,
      checked_at=NULL,observed_at=NULL,source='Ожидает проверки',source_tier=NULL,source_url=NULL,
      note='Источник мониторинга изменён; ждём новой проверки' WHERE server_id=?
      AND (SELECT version FROM public_server_projection WHERE server_id=?)=? ${currentAttempt}
      AND COALESCE(checked_at,'')<(SELECT received_at FROM public_server_projection WHERE server_id=?)`)
      .bind(payload.serverId,payload.serverId,payload.version,payload.serverId,applyToken,payload.serverId))
  }
  await db.batch(writes)
}
