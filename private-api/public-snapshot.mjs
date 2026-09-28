export async function createPublicSnapshot(tx,serverId,version) {
  const server=(await tx.query('SELECT owner_id,name FROM gs_server_registry WHERE server_id=$1',[serverId])).rows[0]
  const restricted=(await tx.query(`SELECT DISTINCT material_key FROM gs_material_restrictions
    WHERE server_id=$1 AND active=true ORDER BY material_key`,[serverId])).rows.map(row=>row.material_key)
  const approved=(await tx.query(`SELECT summary FROM gs_owner_summary_edits
    WHERE server_id=$1 AND status='APPROVED' ORDER BY resolved_at DESC,id DESC LIMIT 1`,[serverId])).rows[0]
  const facts=(await tx.query(`SELECT DISTINCT ON (field) field,value FROM gs_owner_fact_edits
    WHERE server_id=$1 AND status='APPROVED' ORDER BY field,resolved_at DESC,id DESC`,[serverId])).rows
  const support=(await tx.query(`SELECT COALESCE(sum(coins),0)::bigint AS coins,
    count(DISTINCT user_id)::integer AS participants FROM gs_support WHERE server_id=$1`,[serverId])).rows[0]
  const monitor=(await tx.query(`SELECT enabled,method,host,port,api_url FROM gs_owner_monitoring_overrides
    WHERE server_id=$1`,[serverId])).rows[0]
  const links=Object.fromEntries(facts.filter(row=>['site','discord','telegram'].includes(row.field)).map(row=>[row.field,row.value]))
  const publicFacts=facts.filter(row=>!['site','discord','telegram'].includes(row.field))
  return {serverId,version:Number(version),claimed:!!server.owner_id,
    restrictedLinks:restricted.filter(key=>key!=='description'),
    restrictedMaterials:restricted.filter(key=>key==='description'),
    supportCoins:Number(support.coins),supportParticipants:support.participants,
    ...(approved?{summary:approved.summary}:{}),
    ...(publicFacts.length?{facts:Object.fromEntries(publicFacts.map(row=>[row.field,row.field==='modes'?row.value.split(',').map(mode=>mode.trim()):row.value]))}:{}),
    ...(Object.keys(links).length?{links}:{}),
    ...(monitor?{monitoring:monitor.enabled?{enabled:true,method:monitor.method,
      ...(monitor.host?{host:monitor.host}:{}),...(monitor.port?{port:monitor.port}:{}),
      ...(monitor.api_url?{apiUrl:monitor.api_url}:{}),
      ...(monitor.method==='SERVER_API'?{expectName:server.name}:{})}:{enabled:false}}:{})}
}
