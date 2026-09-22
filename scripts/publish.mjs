import {readFileSync} from 'node:fs';
const serverId=process.argv[2];
if(!serverId||!/^[a-zA-Z0-9_-]+$/.test(serverId))throw new Error('Usage: npm run dev:publish -- SERVER_ID');
const vars=Object.fromEntries(readFileSync('.dev.vars','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const res=await fetch('http://127.0.0.1:8787/api/v1/admin/servers/'+serverId+'/publish',{method:'POST',headers:{Authorization:'Bearer '+vars.ADMIN_TOKEN,'Content-Type':'application/json'},body:'{}'});
const result=await res.json();
if(!res.ok)throw new Error(JSON.stringify(result));
console.log('Published:',result.name,result.slug);
