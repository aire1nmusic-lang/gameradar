import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,createWriteStream} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {seedSql} from '../scripts/seed.mjs';

const runDir=path.resolve('output/api-'+Date.now());
mkdirSync(runDir,{recursive:true});
const state=path.join(runDir,'state');
const wrangler=path.resolve('node_modules/wrangler/bin/wrangler.js');
const base='http://127.0.0.1:8788/api/v1';
const vars=Object.fromEntries(readFileSync('.dev.vars','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const results=[];
function pass(label){results.push(label);console.log('PASS '+label);}
function cli(args){
 const r=spawnSync(process.execPath,[wrangler,...args],{encoding:'utf8',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 writeFileSync(path.join(runDir,'database.log'),(r.stdout||'')+(r.stderr||''),{flag:'a'});
 assert.equal(r.status,0,'Wrangler local DB command failed; see '+runDir);
 return r.stdout;
}
cli(['d1','migrations','apply','gamescout','--local','--persist-to',state]);
pass('D1 migrations from zero');
const seedFile=path.join(runDir,'seed.sql');writeFileSync(seedFile,seedSql());
for(let i=0;i<2;i++)cli(['d1','execute','gamescout','--local','--persist-to',state,'--file',seedFile]);
pass('Development seed runs twice without overwriting data');

let fileToken='wrong';
const fixture=createServer((req,res)=>{
 if(req.url==='/.well-known/gamescout-verification.txt'){res.writeHead(200,{'Content-Type':'text/plain'});res.end(fileToken);}
 else if(req.url==='/players.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end('[{"id":1,"name":"DEMO player"}]');}
 else if(req.url==='/info.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"vars":{"sv_maxClients":"32"}}');}
 else{res.writeHead(404);res.end();}
});
await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(8790,'127.0.0.1',resolve);});
let worker;let log;
async function start(){
 log=createWriteStream(path.join(runDir,'worker.log'),{flags:'a'});
 worker=spawn(process.execPath,[wrangler,'dev','--local','--ip','127.0.0.1','--port','8788','--local-upstream','127.0.0.1:8788','--inspector-port','9239','--persist-to',state,'--log-level','error'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 worker.stdout.pipe(log);worker.stderr.pipe(log);
 for(let i=0;i<180;i++){
  if(worker.exitCode!==null)throw new Error('Worker exited; see '+runDir);
  try{const r=await fetch(base+'/health');if(r.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 throw new Error('Worker readiness timeout; see '+runDir);
}
async function stop(){
 if(!worker)return;
 if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(worker.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 else worker.kill('SIGTERM');
 await new Promise(r=>setTimeout(r,1000));log?.end();worker=undefined;
}
async function api(route,{method='GET',body,cookie,key,status=200,headers={}}={}){
 const r=await fetch(base+route,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(key?{Authorization:'Bearer '+key}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const json=await r.json();
 assert.equal(r.status,status,method+' '+route+' expected '+status+' got '+r.status+' '+JSON.stringify(json));
 return {json,cookie:r.headers.get('set-cookie')?.split(';')[0],response:r};
}
function findDb(dir){
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){const found=findDb(file);if(found)return found;}
  else if(file.endsWith('.sqlite')){
   const db=new DatabaseSync(file,{readOnly:true});
   try{if(db.prepare("SELECT name FROM sqlite_master WHERE name='votes'").get())return file;}finally{db.close();}
  }
 }
}
try{
 await start();pass('Worker /health uses real D1');
 // Accounts in D1 are off by default: personal data lives in the private API in Russia.
 assert.equal((await api('/auth/register',{method:'POST',body:{email:'a@example.com',password:'long enough 1',displayName:'Al'},status:503})).json.error.code,'accounts_unavailable');
 assert.equal((await api('/me',{method:'PATCH',body:{displayName:'Alice'},status:503})).json.error.code,'accounts_unavailable');
 const closed=(await api('/auth/me')).json;assert.deepEqual(closed.providers,[]);assert.equal(closed.emailLogin,false);
 pass('D1 accounts are closed unless ACCOUNTS_IN_D1=true; /auth/me reports no providers');
 const games=(await api('/games')).json;assert.equal(games.length,6);
 assert.equal(games.find(g=>g.id==='lineage2').chronicles.length,5);
 assert.equal(games.find(g=>g.id==='minecraft').chronicles.length,6);
 assert.equal(games.find(g=>g.id==='gtarp').chronicles.length,3);
 const catalog=(await api('/servers')).json;assert.equal(catalog.total,9);assert.ok(catalog.items.every(s=>s.demo&&s.name.includes('DEMO')));
 pass('GET games, chronicles and nine labelled DEMO servers');
 assert.equal((await api('/servers?gameId=minecraft&limit=2&offset=1')).json.items.length,2);
 await api('/servers?limit=-1',{status:400});
 await api('/owners/me/servers',{status:401});
 await api('/auth/dev',{method:'POST',body:{displayName:'Bad',secret:'wrong'},status:401});
 const owner=await api('/auth/dev',{method:'POST',body:{displayName:'API acceptance owner',secret:vars.DEV_AUTH_SECRET}});
 assert.ok(owner.cookie);const cookie=owner.cookie;
 assert.ok(owner.response.headers.get('set-cookie').includes('HttpOnly'));
 const other=await api('/auth/dev',{method:'POST',body:{displayName:'API acceptance outsider',secret:vars.DEV_AUTH_SECRET}});
 pass('Local secret login, HttpOnly session and protected owner endpoints');
 const create={name:'DEMO Acceptance Minecraft',gameId:'minecraft',chronicleId:'survival',website:'http://127.0.0.1:8790',description:'DEMO server created by the real HTTP acceptance test.',language:'Русский',country:'RU'};
 const server=(await api('/servers',{method:'POST',body:create,cookie,status:201})).json;
 assert.equal(server.moderation,'PENDING_MODERATION');
 assert.ok(server.id&&server.slug);
 assert.equal((await api('/servers')).json.total,9);
 await api('/servers/'+server.slug,{status:404});
 await api('/servers',{method:'POST',body:{...create,gameId:'missing'},cookie,status:400});
 await api('/servers/'+server.id,{method:'PATCH',cookie:other.cookie,body:{name:'stolen'},status:403});
 const owned=(await api('/owners/me/servers',{cookie})).json;
 assert.ok((owned.items??owned).some(s=>s.id===server.id));
 await api('/admin/servers/'+server.id+'/publish',{method:'POST',body:{},key:vars.ADMIN_TOKEN});
 assert.equal((await api('/servers/'+server.slug)).json.moderation,'PUBLISHED');
 assert.ok((await api('/servers?gameId=minecraft')).json.items.some(s=>s.id===server.id));
 pass('Create pending -> private draft -> admin publish -> public catalogue/profile');

 const claim=(await api('/claims',{method:'POST',body:{serverId:server.id,method:'SITE_FILE'},cookie,status:201})).json;
 assert.ok(claim.proofToken);
 await api('/claims/'+claim.id,{cookie:other.cookie,status:404});
 const wrong=await fetch(base+'/claims/'+claim.id+'/verify',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});
 assert.ok(!wrong.ok,'Wrong website token must never verify');
 fileToken=claim.proofToken;
 const verified=(await api('/claims/'+claim.id+'/verify',{method:'POST',body:{},cookie})).json;
 assert.equal(verified.status,'VERIFIED');
 const claimedServers=(await api('/owners/me/servers',{cookie})).json;
 assert.ok((claimedServers.items??claimedServers).find(s=>s.id===server.id).ownerId);
 pass('FILE claim reads actual local website, rejects wrong token, assigns owner');

 await api('/servers/'+server.id+'/vote-integration',{method:'PATCH',cookie,body:{rewardTitle:'DEMO diamonds',rewardDescription:'Three demo diamonds',cooldownHours:12}});
 await api('/servers/'+server.id+'/api-key',{method:'POST',cookie:other.cookie,body:{},status:403});
 const keyResponse=(await api('/servers/'+server.id+'/api-key',{method:'POST',cookie,body:{}})).json;
 const key=keyResponse.apiKey;assert.ok(key);
 const integration=(await api('/servers/'+server.id+'/vote-integration',{cookie})).json;
 assert.equal(integration.apiKey,undefined);assert.equal(integration.apiKeyHash,undefined);
 assert.ok(!JSON.stringify(integration).includes(key));
 await api('/votes/pending',{status:401});
 const vote=(await api('/votes',{method:'POST',body:{serverId:server.id,nickname:'DemoPlayer'},status:201})).json;
 assert.ok(vote.id);
 await api('/votes',{method:'POST',body:{serverId:server.id,nickname:'demoplayer'},status:429});
 pass('Reward settings, owner-only key rotation, real vote and case-insensitive cooldown');

 const parallel=await Promise.all([1,2,3].map(()=>fetch(base+'/votes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serverId:server.id,nickname:'RacePlayer'})})));
 assert.equal(parallel.filter(r=>r.status===201).length,1);
 assert.ok(parallel.filter(r=>r.status!==201).every(r=>r.status===429));
 pass('Concurrent duplicate vote requests save exactly one vote');
 const pending=(await api('/votes/pending',{key})).json;
 const votes=pending.items??pending;assert.ok(votes.some(v=>v.id===vote.id));assert.ok(votes.every(v=>v.serverId===server.id));
 const ids=votes.map(v=>v.id);
 const deliveries=await Promise.all([1,2].map(()=>api('/votes/claim',{method:'POST',key,body:{ids}})));
 const extracted=deliveries.map(r=>r.json.items??r.json.claimed??r.json);
 const claimedIds=extracted.flat().map(v=>typeof v==='string'?v:v.id);
 assert.equal(claimedIds.length,ids.length);assert.equal(new Set(claimedIds).size,ids.length);
 const repeat=(await api('/votes/claim',{method:'POST',key,body:{ids}})).json;
 assert.equal((repeat.items??repeat.claimed??repeat).length,0);
 assert.equal(((await api('/votes/pending',{key})).json.items??(await api('/votes/pending',{key})).json).length,0);
 pass('Pull pending scoped to server; concurrent and repeated claims return each vote once');

 const rotate=(await api('/servers/'+server.id+'/api-key',{method:'POST',cookie,body:{}})).json;
 assert.notEqual(rotate.apiKey,key);
 await api('/votes/pending',{key,status:401});
 await api('/votes/pending',{key:rotate.apiKey});
 pass('Rotation invalidates old API key');
 const view1=(await api('/events',{method:'POST',body:{serverId:server.id,kind:'VIEW',source:'search'},status:202})).json;
 const view2=(await api('/events',{method:'POST',body:{serverId:server.id,kind:'VIEW',source:'search'},status:202})).json;
 assert.equal(view1.recorded,true);assert.equal(view2.recorded,false,'the same visitor within 30 minutes is counted once');
 await api('/events',{method:'POST',body:{serverId:server.id,kind:'PLAY_CLICK'},status:202});
 await api('/events',{method:'POST',body:{serverId:server.id,kind:'HACK'},status:400});
 await api('/events',{method:'POST',body:{serverId:'missing',kind:'VIEW'},status:404});
 const stats=(await api('/servers/'+server.id+'/stats',{cookie})).json;
 assert.equal(stats.totals.views,1);assert.equal(stats.totals.playClicks,1);assert.equal(stats.views.length,30);
 assert.ok(stats.votes.total>=2);assert.equal(stats.sources[0].source,'search');
 await api('/servers/'+server.id+'/stats',{cookie:other.cookie,status:403});
 await api('/servers/'+server.id+'/stats',{status:401});
 const ownerVotes=(await api('/servers/'+server.id+'/votes',{cookie})).json;
 assert.ok(ownerVotes.some(v=>v.nickname==='DemoPlayer'&&v.status==='CLAIMED'));
 await api('/servers/'+server.id+'/votes',{cookie:other.cookie,status:403});
 pass('Card events deduped per visitor; owner-only stats and vote list from stored rows');
 await stop();
 const db=new DatabaseSync(findDb(state),{readOnly:true});
 const row=db.prepare('SELECT * FROM vote_integrations WHERE server_id=?').get(server.id);
 assert.equal(row.api_key,undefined);assert.equal(row.api_key_hash.length,64);assert.notEqual(row.api_key_hash,rotate.apiKey);
 const sessions=db.prepare('SELECT * FROM sessions').all();assert.ok(sessions.length>=2);assert.ok(sessions.every(s=>s.token===undefined&&s.token_hash.length===64));
 const storedVotes=db.prepare('SELECT * FROM votes WHERE server_id=?').all(server.id);
 assert.ok(storedVotes.every(v=>v.claimed_at&&v.delivered_at));db.close();
 pass('Actual SQLite contains API/session hashes and claimed/delivered timestamps');

 await start();
 assert.equal((await api('/servers/'+server.slug)).json.id,server.id);
 assert.ok((await api('/auth/me',{cookie})).json.user);
 const after=(await api('/votes/pending',{key:rotate.apiKey})).json;assert.equal((after.items??after).length,0);
 pass('Worker restart preserves server, session, keys and delivered votes');
 await api('/auth/logout',{method:'POST',cookie,body:{}});
 await api('/owners/me/servers',{cookie,status:401});
 pass('Logout invalidates stored session');
 writeFileSync(path.join(runDir,'result.json'),JSON.stringify({passed:true,checks:results,server:{id:server.id,slug:server.slug}},null,2));
 console.log('API acceptance passed. Report: '+path.join(runDir,'result.json'));
}catch(error){
 writeFileSync(path.join(runDir,'result.json'),JSON.stringify({passed:false,checks:results,error:String(error)},null,2));
 throw error;
}finally{await stop();await new Promise(r=>fixture.close(r));}
