import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runWrangler,stateArgs} from './tooling.mjs';
const q=v=>v==null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
export function seedSql(){
 const at=new Date().toISOString();
 const games=[
 ['lineage2','lineage-2','Lineage 2','Lineage 2','Хроники от Interlude до Essence','spire','#3358D4','#7A4BF0','#6D7BF5',1],
 ['minecraft','minecraft','Minecraft','Minecraft','Выживание, анархия и мини-игры','cubes','#2C7A3F','#8CC63F','#7BC950',1],
 ['gtarp','gta-rp','GTA RP','GTA RP','Ролевые города на FiveM, RageMP и alt:V','skyline','#F0913A','#DB3D77','#F0913A',1],
 ['rust','rust','Rust','Rust','Каталог серверов Rust','barrel','#B84A25','#E08A3C','#DD7A3C',0],
 ['cs2','cs2','Counter-Strike 2','CS2','Каталог серверов CS2','crosshair','#D98324','#2A6BB0','#D98324',0],
 ['dayz','dayz','DayZ','DayZ','Каталог серверов DayZ','signal','#5C6B47','#9AA34C','#8E9A55',0]];
 const chronicles=[
 ['interlude','lineage2','interlude','Interlude','l2-interlude'],
 ['high-five','lineage2','high-five','High Five','l2-high-five'],
 ['essence','lineage2','essence','Essence','l2-essence'],
 ['classic','lineage2','classic','Classic',null],
 ['gracia','lineage2','gracia-final','Gracia Final',null],
 ...['Survival','Anarchy','SkyBlock','BedWars','Prison','Modded'].map(label=>[label.toLowerCase(),'minecraft',label.toLowerCase(),label,null]),
 ['fivem','gtarp','fivem','FiveM',null],['ragemp','gtarp','ragemp','RageMP',null],['altv','gtarp','alt-v','alt:V',null]];
 const sql=['-- Local development only. Stable IDs; repeat seed never overwrites owners or votes.'];
 games.forEach((g,i)=>sql.push('INSERT OR IGNORE INTO games (id,slug,name,short_name,tagline,motif,color_from,color_to,accent,is_primary,sort_order,created_at) VALUES ('+[...g,i,at].map(q).join(',')+');'));
 chronicles.forEach((c,i)=>{
  sql.push('INSERT OR IGNORE INTO chronicles (id,game_id,slug,label,theme_id,sort_order) VALUES ('+[...c,i].map(q).join(',')+');');
  sql.push('INSERT OR IGNORE INTO chronicle_versions (chronicle_id,version) VALUES ('+[c[0],c[3]].map(q).join(',')+');');
 });
 const selections=[['lineage2','interlude'],['lineage2','high-five'],['lineage2','essence'],['minecraft','survival'],['minecraft','anarchy'],['minecraft','skyblock'],['gtarp','fivem'],['gtarp','ragemp'],['gtarp','altv']];
 selections.forEach(([gameId,chronicleId],i)=>{
  const c=chronicles.find(c=>c[0]===chronicleId);
  const name='DEMO '+games.find(g=>g[0]===gameId)[2]+' '+c[3];
  const id='demo-'+gameId+'-'+chronicleId;
  const description='DEMO: вымышленный сервер для разработки GameScout. Не является реальным игровым проектом. Онлайн не измерен.';
  const cols=['id','slug','name','game_id','chronicle_id','version','summary','description','modes','tags','languages','website','region','country','flag','hue','moderation','added_at','updated_at','is_demo'];
  const vals=[id,id,name,gameId,chronicleId,gameId==='minecraft'?'1.21':c[3],description,description,JSON.stringify([c[3]]),'["DEMO"]','["Русский","English"]','https://example.com','EU','DE','🇩🇪',i*39,'PUBLISHED',at,at,1];
  sql.push('INSERT OR IGNORE INTO servers ('+cols.join(',')+') VALUES ('+vals.map(q).join(',')+');');
  sql.push('INSERT OR IGNORE INTO server_online (server_id,status,current,max,source,method,note) VALUES ('+[id,'PENDING',0,0,'Нет измерений','OWNER_SUBMITTED','DEMO: игровой endpoint не настроен'].map(q).join(',')+');');
 });
 return sql.join('\n')+'\n';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 mkdirSync('.wrangler',{recursive:true});writeFileSync('.wrangler/dev-seed.sql',seedSql());
 runWrangler(['d1','execute','gamescout','--local',...stateArgs(),'--file','.wrangler/dev-seed.sql']);
}
