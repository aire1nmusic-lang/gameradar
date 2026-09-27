export async function createPublicSnapshot(tx,serverId,version) {
  const server=(await tx.query('SELECT owner_id FROM gs_server_registry WHERE server_id=$1',[serverId])).rows[0]
  const restricted=(await tx.query(`SELECT DISTINCT material_key FROM gs_material_restrictions
    WHERE server_id=$1 AND active=true ORDER BY material_key`,[serverId])).rows.map(row=>row.material_key)
  const approved=(await tx.query(`SELECT summary FROM gs_owner_summary_edits
    WHERE server_id=$1 AND status='APPROVED' ORDER BY resolved_at DESC,id DESC LIMIT 1`,[serverId])).rows[0]
  return {serverId,version:Number(version),claimed:!!server.owner_id,restrictedLinks:restricted,
    ...(approved?{summary:approved.summary}:{})}
}
