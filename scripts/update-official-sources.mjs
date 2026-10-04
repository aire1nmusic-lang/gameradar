import {spawnSync} from 'node:child_process'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
const keys=['l2:thebattle.club:nostalgia-x10','l2:l2mad.net:x30']
const q=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'"
const run=(sql)=>{const p=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','gamescout','--remote','--json','--command',sql],{encoding:'utf8',windowsHide:true});if(p.status!==0)throw new Error(p.stderr||'D1 read failed');return JSON.parse(p.stdout.slice(p.stdout.indexOf('['))).flatMap(v=>v.results??[])}
const dir='output/official-source-update'
await mkdir(dir,{recursive:true})
if(process.argv.includes('--apply')){
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','gamescout','--remote','--file',dir+'/apply.sql'],{stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status??1)
 console.log('Existing monitor will read the two official sources; no count inserted manually.')
}else{
 const records=JSON.parse(await readFile('import/lineage2.json','utf8'))
 const servers=run(`SELECT s.id,s.import_key,s.owner_id,COALESCE(p.claimed,0) claimed FROM servers s LEFT JOIN public_server_projection p ON p.server_id=s.id WHERE s.import_key IN (${keys.map(q).join(',')}) AND s.moderation='PUBLISHED'`)
 if(servers.length!==2||servers.some(s=>s.owner_id||s.claimed))throw new Error('Expected exactly two unclaimed public servers; abort without writes')
 const before=run(`SELECT * FROM online_sources WHERE server_id IN (${servers.map(s=>q(s.id)).join(',')})`)
 await writeFile(dir+'/before.json',JSON.stringify({servers,sources:before},null,2))
 const apply=[],rollback=[]
 for(const server of servers){
  const source=records.find(r=>r.key===server.import_key).onlineSources[0],id=server.id+':'+source.provider
  const old=before.find(s=>s.server_id===server.id&&s.provider===source.provider)
  const guard=`NOT EXISTS(SELECT 1 FROM public_server_projection WHERE server_id=${q(server.id)} AND claimed=1) AND EXISTS(SELECT 1 FROM servers WHERE id=${q(server.id)} AND owner_id IS NULL AND import_key=${q(server.import_key)})`
  apply.push(`INSERT INTO online_sources(id,server_id,tier,provider,name,url,config,enabled) SELECT ${[id,server.id,'OFFICIAL',source.provider,'Сайт проекта',source.url,JSON.stringify(source.config),1].map(q).join(',')} WHERE ${guard} ON CONFLICT(server_id,provider) DO UPDATE SET config=excluded.config,url=excluded.url,name=excluded.name,tier='OFFICIAL',enabled=1 WHERE ${guard};`)
  if(old)rollback.push(`UPDATE online_sources SET ${['tier','name','url','config','enabled'].map(k=>k+'='+q(old[k])).join(',')} WHERE id=${q(old.id)} AND ${guard};`)
  else rollback.push(`UPDATE online_sources SET enabled=0 WHERE id=${q(id)} AND ${guard};`)
 }
 await writeFile(dir+'/apply.sql',apply.join('\n')+'\n')
 await writeFile(dir+'/rollback.sql',rollback.join('\n')+'\n')
 console.log('Backed up two existing public source configurations; reversible plan prepared. No schema/private/financial changes.')
}
