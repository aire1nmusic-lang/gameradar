export type PublicSnapshot = { serverId: string; version: number; claimed: boolean; restrictedLinks?: Array<'site'|'discord'|'telegram'>; summary?: string }
export function parsePublicSnapshot(value: unknown): PublicSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_projection')
  const row=value as Record<string,unknown>
  if (Object.keys(row).some(key=>!['claimed','serverId','version','restrictedLinks','summary'].includes(key))
    || !['claimed','serverId','version'].every(key=>Object.hasOwn(row,key))
    || typeof row.serverId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.serverId)
    || !Number.isSafeInteger(row.version) || Number(row.version)<1 || typeof row.claimed!=='boolean') throw new Error('invalid_projection')
  if(row.restrictedLinks!==undefined && (!Array.isArray(row.restrictedLinks)
    || row.restrictedLinks.length>3 || new Set(row.restrictedLinks).size!==row.restrictedLinks.length
    || row.restrictedLinks.some(key=>!['site','discord','telegram'].includes(key)))) throw new Error('invalid_projection')
  if(row.summary!==undefined && (typeof row.summary!=='string'||row.summary.length<20||row.summary.length>280
    || /[<>\u0000-\u001f]|\b(?:https?:\/\/|www\.)|\[[^\]]+\]\(/i.test(row.summary))) throw new Error('invalid_projection')
  return row as PublicSnapshot
}
export const projectionSql = `INSERT INTO public_server_projection(server_id,version,claimed,restricted_links,received_at) VALUES(?,?,?,?,?)
  ON CONFLICT(server_id) DO UPDATE SET version=excluded.version,claimed=excluded.claimed,
    restricted_links=excluded.restricted_links,received_at=excluded.received_at
  WHERE excluded.version>public_server_projection.version`
export async function applyPublicSnapshot(db:D1Database,payload:PublicSnapshot) {
  const receivedAt=new Date().toISOString()
  const writes=[db.prepare(projectionSql).bind(payload.serverId,payload.version,payload.claimed?1:0,
    JSON.stringify(payload.restrictedLinks??[]),receivedAt)]
  if(payload.summary!==undefined)writes.push(db.prepare(`UPDATE servers SET summary=?,updated_at=? WHERE id=?
    AND (SELECT version FROM public_server_projection WHERE server_id=?)=?`)
    .bind(payload.summary,receivedAt,payload.serverId,payload.serverId,payload.version))
  await db.batch(writes)
}
