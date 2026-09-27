export type PublicSnapshot = { serverId: string; version: number; claimed: boolean }
export function parsePublicSnapshot(value: unknown): PublicSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_projection')
  const row=value as Record<string,unknown>
  if (Object.keys(row).sort().join(',') !== 'claimed,serverId,version' || typeof row.serverId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.serverId)
    || !Number.isSafeInteger(row.version) || Number(row.version)<1 || typeof row.claimed!=='boolean') throw new Error('invalid_projection')
  return row as PublicSnapshot
}
export const projectionSql = `INSERT INTO public_server_projection(server_id,version,claimed,received_at) VALUES(?,?,?,?)
  ON CONFLICT(server_id) DO UPDATE SET version=excluded.version,claimed=excluded.claimed,received_at=excluded.received_at
  WHERE excluded.version>public_server_projection.version`
export async function applyPublicSnapshot(db:D1Database,payload:PublicSnapshot) {
  await db.prepare(projectionSql).bind(payload.serverId,payload.version,payload.claimed?1:0,new Date().toISOString()).run()
}
