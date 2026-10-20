// Disposable, loopback-only PostgreSQL17 acceptance. Never reads production env/keys.
import assert from 'node:assert/strict'
import {execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
import {randomBytes,createHash} from 'node:crypto'
import {mkdir,mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises'
import {resolve,join,relative,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import {migrate,migrationPlan,postgresStore} from '../private-api/db.mjs'
import {rehearseCoreScenarios} from '../private-api/rehearsal-scenarios.mjs'
import {rehearseVoteRisk} from '../private-api/vote-risk-rehearsal.mjs'

const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const image='postgres:17-bookworm'
async function tool(name){
  if(process.platform==='win32'){
    const file=`C:/Program Files/Git/usr/bin/${name}.exe`
    try{await access(file);return file}catch{}
  }
  return name
}
async function command(file,args,options={}){
  try{return await exec(file,args,{windowsHide:true,timeout:180000,maxBuffer:16*1024*1024,...options})}
  catch(error){throw new Error(`${file.split(/[\\/]/).at(-1)} failed (${error.code??'unknown'}): ${String(error.stderr||'').slice(-800)}`)}
}
async function pipeDocker(args,bytes){
  return new Promise((yes,no)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','ignore','pipe']});let error=''
    const timer=setTimeout(()=>child.kill(),60000)
    child.stderr.on('data',data=>error+=data);child.stdin.on('error',()=>{})
    child.on('error',no);child.on('close',code=>{clearTimeout(timer);code===0?yes():no(new Error(`PostgreSQL restore failed (${code}): ${error.slice(-500)}`))})
    child.stdin.end(bytes)
  })
}
const summary=async db=>({
  tables:(await db.query(`SELECT relname,n_live_tup FROM pg_stat_user_tables ORDER BY relname`)).rows.map(r=>r.relname),
  counts:(await db.query(`SELECT
    (SELECT count(*)::integer FROM gs_users) users,
    (SELECT count(*)::integer FROM gs_votes) votes,
    (SELECT count(*)::integer FROM gs_claims) claims,
    (SELECT count(*)::integer FROM gs_coin_ledger) ledger,
    (SELECT count(*)::integer FROM gs_audit) audit,
    (SELECT count(*)::integer FROM gs_migrations) migrations,
    (SELECT count(*)::integer FROM gs_copyright_claims) copyright,
    (SELECT coalesce(sum(balance),0)::integer FROM gs_coin_accounts) balance,
    (SELECT coalesce(sum(delta),0)::integer FROM gs_coin_ledger) ledger_sum`)).rows[0]
})

export async function localPostgresAcceptance(){
  assert.equal(process.env.PRIVATE_LOCAL_POSTGRES_REHEARSAL,'1','Explicit PRIVATE_LOCAL_POSTGRES_REHEARSAL=1 required')
  await mkdir('output',{recursive:true})
  const root=resolve('output'),dir=await mkdtemp(join(root,'local-postgres-'))
  const id=randomBytes(8).toString('hex'),name=`gamescout-acceptance-${id}`,label=`local-${id}`
  const openssl=await tool('openssl'),gpg=await tool('gpg'),gpgconf=await tool('gpgconf')
  let container=false,control,db,restored,report
  const oldFetch=globalThis.fetch
  globalThis.fetch=async()=>{throw new Error('External providers forbidden in disposable acceptance')}
  try{
    await mkdir(join(dir,'tls'),{mode:0o700});await mkdir(join(dir,'gpg'),{mode:0o700})
    await command(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost',
      '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',join(dir,'tls/server.key'),'-out',join(dir,'tls/server.crt')])
    await writeFile(join(dir,'postgres.env'),`POSTGRES_USER=gsacceptance\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nPOSTGRES_DB=postgres\n`,{mode:0o600})
    container=true // Include a lost run response in the guarded cleanup path.
    await command('docker',['run','--detach','--rm','--name',name,'--label',`gamescout.acceptance=${label}`,
      '--env-file',join(dir,'postgres.env'),'--publish','127.0.0.1::5432',
      '--mount',`type=bind,source=${join(dir,'tls')},target=/test-tls,readonly`,image,'sh','-c',
      'cp /test-tls/server.crt /tmp/server.crt; cp /test-tls/server.key /tmp/server.key; chown postgres:postgres /tmp/server.*; chmod 600 /tmp/server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key'])
    const endpoint=(await command('docker',['port',name,'5432/tcp'])).stdout.trim()
    assert.match(endpoint,/^127\.0\.0\.1:\d+$/)
    const env=await readFile(join(dir,'postgres.env'),'utf8'),password=env.match(/POSTGRES_PASSWORD=(.+)/)[1]
    const ca=await readFile(join(dir,'tls/server.crt'),'utf8')
    const url=new URL(`postgresql://gsacceptance:${password}@${endpoint}/postgres`)
    control=postgresStore(url.href,ca)
    let ready=false
    for(let attempt=0;attempt<30;attempt++){
      try{await control.query('SELECT 1');ready=true;break}catch{await new Promise(r=>setTimeout(r,1000))}
    }
    assert.ok(ready,'Disposable PostgreSQL did not become ready')
    assert.equal((await control.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true)
    const untrusted=postgresStore(url.href,'not-the-disposable-CA')
    try{await assert.rejects(()=>untrusted.query('SELECT 1'),/certificate|PEM|SSL/i)}finally{await untrusted.close()}
    const database=`gamescout_e2e_${Date.now()}_${randomBytes(4).toString('hex')}`,restore=database+'_restore'
    await control.query(`CREATE DATABASE "${database}"`);url.pathname='/'+database
    db=postgresStore(url.href,ca);await migrate(db);await migrate(db)
    assert.equal((await migrationPlan(db)).pending.length,0)
    const scenarios=await rehearseCoreScenarios(db)
    const voteRisk=await rehearseVoteRisk(db)
    const before=await summary(db)
    const dump=(await command('docker',['exec',name,'pg_dump','-U','gsacceptance','-d',database,'--format=custom'],{encoding:'buffer'})).stdout
    assert.ok(dump.length>0)
    await writeFile(join(dir,'test.dump'),dump,{mode:0o600})
    // Relative arguments also work with Git for Windows' MSYS GPG executable.
    const home='gpg',identity='GameScout disposable acceptance <local-acceptance@example.invalid>',options={cwd:dir}
    await command(gpg,['--homedir',home,'--batch','--pinentry-mode','loopback','--passphrase','','--quick-generate-key',identity,'default','default','1d'],options)
    await command(gpg,['--homedir',home,'--batch','--yes','--trust-model','always','--recipient',identity,'--output','test.dump.gpg','--encrypt','test.dump'],options)
    await command(gpg,['--homedir',home,'--batch','--yes','--pinentry-mode','loopback','--passphrase','','--output','verified.dump','--decrypt','test.dump.gpg'],options)
    const verified=await readFile(join(dir,'verified.dump'));assert.equal(sha(verified),sha(dump))
    await control.query(`CREATE DATABASE "${restore}"`)
    await pipeDocker(['exec','-i',name,'pg_restore','-U','gsacceptance','-d',restore,'--exit-on-error'],verified)
    url.pathname='/'+restore;restored=postgresStore(url.href,ca)
    assert.deepEqual(await summary(restored),before)
    assert.equal(before.counts.balance,before.counts.ledger_sum)
    await assert.rejects(()=>restored.query('DELETE FROM gs_coin_ledger'),/append.only|immutable/)
    await assert.rejects(()=>restored.query('DELETE FROM gs_audit'),/append.only/)
    report={scope:'local-disposable-real-postgresql',imageId:(await command('docker',['image','inspect','--format','{{.Id}}',image])).stdout.trim(),postgresVersion:(await control.query('SHOW server_version')).rows[0].server_version,
      tlsVerified:true,untrustedCaRejected:true,migrations:before.counts.migrations,scenarios,voteRisk,encryptedRestore:{dumpSha256:sha(dump),
        encryptedBytes:(await readFile(join(dir,'test.dump.gpg'))).length,restoredCounts:before.counts,immutableTriggersVerified:true},
      externalProvidersInvoked:false,productionDataChanged:false,newCloudResources:0}
  }finally{
    globalThis.fetch=oldFetch
    try{for(const store of [restored,db,control])if(store)await store.close()}
    finally{
      try{
        if(container){
          const found=await command('docker',['inspect','--format','{{index .Config.Labels "gamescout.acceptance"}}',name])
            .catch(error=>{if(/No such (object|container)/i.test(error.message))return null;throw error})
          if(found){assert.equal(found.stdout.trim(),label,'Refuse to remove an unrelated container')
            await command('docker',['rm','--force','--volumes',name])}
        }
      }finally{
        await command(gpgconf,['--homedir','gpg','--kill','gpg-agent'],{cwd:dir}).catch(()=>{})
        assert.ok(relative(root,dir)&&!relative(root,dir).startsWith('..'+sep)&&!relative(root,dir).includes('..'),'Unsafe local cleanup target')
        await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:250})
      }
    }
  }
  await writeFile('output/local-postgres-acceptance.json',JSON.stringify({...report,disposableContainerRemoved:true},null,2)+'\n')
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  localPostgresAcceptance().then(result=>console.log(JSON.stringify(result)))
    .catch(error=>{console.error(error.message);process.exitCode=1})
}
