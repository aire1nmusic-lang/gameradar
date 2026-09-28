export type PublicSnapshot = { serverId: string; version: number; claimed: boolean; restrictedLinks?: Array<'site'|'discord'|'telegram'>; restrictedMaterials?: Array<'description'>; summary?: string; facts?: Partial<Record<'version'|'rates'|'region'|'openedAt'|'country',string>> & {modes?:string[]}; supportCoins?: number; supportParticipants?: number }
export function parsePublicSnapshot(value: unknown): PublicSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_projection')
  const row=value as Record<string,unknown>
  if (Object.keys(row).some(key=>!['claimed','serverId','version','restrictedLinks','restrictedMaterials','summary','facts','supportCoins','supportParticipants'].includes(key))
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
  for(const amount of [row.supportCoins,row.supportParticipants])
    if(amount!==undefined&&(!Number.isSafeInteger(amount)||Number(amount)<0))throw new Error('invalid_projection')
  if((row.supportCoins===undefined)!==(row.supportParticipants===undefined))throw new Error('invalid_projection')
  return row as PublicSnapshot
}
export const projectionSql = `INSERT INTO public_server_projection(server_id,version,claimed,restricted_links,restricted_materials,support_coins,support_participants,received_at) VALUES(?,?,?,?,?,?,?,?)
  ON CONFLICT(server_id) DO UPDATE SET version=excluded.version,claimed=excluded.claimed,
    restricted_links=excluded.restricted_links,restricted_materials=excluded.restricted_materials,support_coins=excluded.support_coins,
    support_participants=excluded.support_participants,received_at=excluded.received_at
  WHERE excluded.version>public_server_projection.version`
export async function applyPublicSnapshot(db:D1Database,payload:PublicSnapshot) {
  const receivedAt=new Date().toISOString()
  const writes=[db.prepare(projectionSql).bind(payload.serverId,payload.version,payload.claimed?1:0,
    JSON.stringify(payload.restrictedLinks??[]),JSON.stringify(payload.restrictedMaterials??[]),
    payload.supportCoins??0,payload.supportParticipants??0,receivedAt)]
  if(payload.summary!==undefined)writes.push(db.prepare(`UPDATE servers SET summary=?,updated_at=? WHERE id=?
    AND (SELECT version FROM public_server_projection WHERE server_id=?)=?`)
    .bind(payload.summary,receivedAt,payload.serverId,payload.serverId,payload.version))
  for(const [field,column] of Object.entries({version:'version',rates:'rates',region:'region',openedAt:'opened_at',country:'country'})) {
    const value=payload.facts?.[field as keyof NonNullable<PublicSnapshot['facts']>]
    if(value!==undefined)writes.push(db.prepare(`UPDATE servers SET ${column}=?,updated_at=? WHERE id=?
      AND (SELECT version FROM public_server_projection WHERE server_id=?)=?`)
      .bind(value,receivedAt,payload.serverId,payload.serverId,payload.version))
  }
  if(payload.facts?.modes)writes.push(db.prepare(`UPDATE servers SET modes=?,updated_at=? WHERE id=?
    AND (SELECT version FROM public_server_projection WHERE server_id=?)=?`)
    .bind(JSON.stringify(payload.facts.modes),receivedAt,payload.serverId,payload.serverId,payload.version))
  await db.batch(writes)
}
