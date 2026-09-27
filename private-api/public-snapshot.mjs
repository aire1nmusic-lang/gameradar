export async function createPublicSnapshot(tx,serverId,version) {
  const server=(await tx.query('SELECT owner_id FROM gs_server_registry WHERE server_id=$1',[serverId])).rows[0]
  const restricted=(await tx.query(`SELECT DISTINCT material_key FROM gs_material_restrictions
    WHERE server_id=$1 AND active=true ORDER BY material_key`,[serverId])).rows.map(row=>row.material_key)
  return {serverId,version:Number(version),claimed:!!server.owner_id,restrictedLinks:restricted}
}
