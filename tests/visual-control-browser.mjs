import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {chromium} from 'playwright'
const live=process.env.CONTROL_QA_BASE_URL, root=resolve('dist');let server
if(!live){server=createServer(async(req,res)=>{try{let p=resolve(root,'.'+new URL(req.url,'http://local').pathname);assert.ok(p.startsWith(root+sep));if(!extname(p))p+='/index.html';let body;try{body=await readFile(p)}catch{p=root+'/index.html';body=await readFile(p)}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(4183,'127.0.0.1',r))}
const base=live||'http://127.0.0.1:4183', games=await(await fetch('https://gamescout.online/api/v1/games')).json()
const catalog=await(await fetch('https://gamescout.online/api/v1/servers?limit=100')).json()
const cards=['lineage2','minecraft','gtarp'].flatMap(gameId=>{const sample=catalog.items.find(s=>s.gameId===gameId);assert.ok(sample);return Array.from({length:36},(_,i)=>({...sample,id:`qa-${gameId}-${i}`,slug:`qa-${gameId}-${i}`,name:`QA ${gameId} ${String(i+1).padStart(2,'0')}`,votes:i<18?18-i:0,support:{coins:i<18?18-i:0,participants:1},online:{...sample.online,current:i<18?180-i:0,status:i<18?'VERIFIED':'PENDING',playersKnown:i<18,freshness:'fresh'},launch:i>=18?{at:new Date(Date.now()+(i-17)*86400000).toISOString()}:undefined}))})
const browser=await chromium.launch(),matrix=[[320,568],[390,844],[768,1024],[1024,768],[1440,900],[844,390]],report=[]
await mkdir('output/control-qa',{recursive:true})
try{for(const [w,h] of matrix){const context=await browser.newContext({viewport:{width:w,height:h}}),page=await context.newPage();let admin=true;await page.route('**/api/v1/**',async route=>{assert.equal(route.request().method(),'GET','Browser QA never writes');const url=new URL(route.request().url()),path=url.pathname;let json=[]
if(path.endsWith('/admin/overview'))json={users:1,servers:108,pending_claims:0,votes:0,support_events:0,pending_test_payments:0};else if(path.endsWith('/coins/me'))json={balance:0,ledger:[],nominalRub:50};else if(path.endsWith('/games'))json=games
else if(path.endsWith('/auth/me'))json={privateCore:true,providers:[],registrationOpen:false,user:admin?{id:'qa-only',displayName:'QA Administrator',roles:['PLAYER','ADMIN'],email:'responsive-profile-check@example.invalid',emailVerified:true,permissions:['system.read','servers.read','servers.review','users.read','claims.review','votes.read','votes.configure','support.read','coins.read','payments.read','moderation.manage','copyright.read']}:null}
else if(path.endsWith('/people-rating'))json=cards.filter(s=>s.votes>0).map(s=>({server_id:s.id,votes:s.votes,slug:s.slug,name:s.name,game_id:s.gameId})).slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+100)
else if(path.endsWith('/support/ranking'))json=cards.filter(s=>s.support.coins>0).map(s=>({server_id:s.id,coins:s.support.coins,participants:1,slug:s.slug,name:s.name,game_id:s.gameId})).slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+100)
else if(path.endsWith('/servers')){let rows=cards.filter(s=>!url.searchParams.get('gameId')||s.gameId===url.searchParams.get('gameId'));if(url.searchParams.get('gameIds'))rows=rows.filter(s=>url.searchParams.get('gameIds').split(',').includes(s.gameId));if(url.searchParams.get('onlyLaunching')==='true')rows=rows.filter(s=>s.launch);const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);json={items:rows.slice(offset,offset+limit),total:rows.length,offset,limit}}
await route.fulfill({json})});
 for(const theme of ['dark','light']){
 await page.goto(base+'/account?game=lineage2');await page.getByRole('button',{name:'Включить демо',exact:true}).waitFor()
 const mode=await page.evaluate(()=>document.documentElement.dataset.colorMode);if(mode!==theme)await page.getByRole('button',{name:theme==='light'?'Включить светлую тему':'Включить тёмную тему',exact:true}).click()
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.locator('.gs-admin-groups').getByRole('button',{name:'Сообщество',exact:true}).click();await page.locator('.gs-admin-subtabs').getByRole('button',{name:'Пользователи',exact:true}).click();await page.locator('.gs-admin-groups').getByRole('button',{name:'Обзор',exact:true}).click();await page.locator('.gs-admin-subtabs').getByRole('button',{name:'Обзор',exact:true}).click();assert.equal(await page.locator('.gs-admin-select').count(),0);assert.equal(await page.getByRole('link',{name:'Избранные серверы',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'Поддержка проектов',exact:true}).count(),0)
 await page.screenshot({path:`output/control-qa/admin-${theme}-${w}.png`,fullPage:true})
 await page.getByRole('button',{name:'Включить демо',exact:true}).click();await page.locator('.gs-demo-banner').waitFor()
 for(const path of ['/lineage-2','/rating?game=lineage2','/catalog?game=lineage2']){
 await page.goto(base+path);await page.locator('a[href^="/server/"]').first().waitFor();await page.waitForFunction(()=>document.querySelector('.gs-row img[src^="data:image/svg+xml"],.l2a .server img[src^="data:image/svg+xml"]'))
 assert.equal(await page.locator('.gs-demo-banner').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 if(path.startsWith('/catalog')){
  const rows=page.locator('.gs-catalog-page .gs-row');assert.equal(await rows.count(),10)
  for(const name of ['Поддержка','Голоса','Общий топ']){await page.getByRole('button',{name:'Сортировка',exact:true}).click();await page.getByRole('option',{name,exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.gs-catalog-page .gs-row .gs-rank-number').length===10)}
  await page.getByRole('button',{name:'Сортировка',exact:true}).click();await page.screenshot({path:`output/control-qa/sort-${theme}-${w}.png`});await page.keyboard.press('Escape');assert.equal(await page.getByRole('listbox').count(),0)
  if(w<1024){await page.getByRole('button',{name:'Фильтры',exact:true}).click();const sheet=page.getByRole('dialog',{name:'Фильтры',exact:true});await sheet.waitFor();assert.equal(await sheet.getByText('Только проверенный онлайн',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`output/control-qa/filters-${theme}-${w}.png`});await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'})}
 }
 await page.screenshot({path:`output/control-qa/demo-${path.startsWith('/lineage')?'world':path.startsWith('/rating')?'rating':'catalog'}-${theme}-${w}.png`,fullPage:true})
 }
 await page.locator('.gs-demo-banner').getByRole('button',{name:'Выключить',exact:true}).click();assert.equal(await page.locator('.gs-demo-banner').count(),0)
 if(w<1024){const nav=page.locator('.gs-mobile-nav');for(const label of ['Главная','Серверы','Избранное','Рейтинг','Открытия'])assert.equal(await nav.getByRole('link',{name:label,exact:true}).isVisible(),true)}
 report.push({w,h,theme,adminGroups:true,demo:true,overflow:false})
 }
 await context.addInitScript(()=>localStorage.setItem('gs.visual-demo','1'));admin=false;await page.goto(base+'/lineage-2');await page.locator('.gs-row,.l2a .server').first().waitFor();assert.equal(await page.locator('.gs-demo-banner').count(),0);assert.equal(await page.locator('.gs-row img[src^="data:image/svg+xml"],.l2a .server img[src^="data:image/svg+xml"]').count(),0);
 await context.close();console.log(`PASS control/demo ${w}x${h} dark/light`)
 }await writeFile('output/control-qa/report.json',JSON.stringify(report,null,2))
}finally{await browser.close();if(server)await new Promise(r=>server.close(r))}
