import {readdirSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const files=readdirSync('dist/assets').filter(f=>f.endsWith('.js'));
const js=files.map(f=>readFileSync('dist/assets/'+f,'utf8')).join('\n');
for(const needle of ['gameradar','GameRadar','mockRepositories','holysky','frostpeak','OWNER_PROJECTS','demo-server-'])assert.ok(!js.includes(needle),'Unexpected fixture/old-brand marker in bundle: '+needle);
assert.ok(js.includes('/api/v1'),'Production path must use HTTP API');
console.log('Production bundle: HTTP API present; no mock catalogue or old brand markers.');
