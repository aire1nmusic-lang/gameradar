import {readPublicGames,readPublicCatalog} from './public-qa-data.mjs'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {chromium} from 'playwright'
const live=process.env.STUDIO_QA_BASE_URL,root=resolve('dist');let server
if(!live){server=createServer(async(req,res)=>{try{let p=resolve(root,'.'+new URL(req.url,'http://local').pathname);assert.ok(p.startsWith(root+sep));if(!extname(p))p+='/index.html';let body;try{body=await readFile(p)}catch{p=root+'/index.html';body=await readFile(p)}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(4184,'127.0.0.1',r))}
const base=live||'http://127.0.0.1:4184',games=await readPublicGames(),catalog=await readPublicCatalog()
const cards=['lineage2','minecraft','gtarp'].flatMap(gameId=>{const sample=catalog.items.find(s=>s.gameId===gameId);return [20,10,0,0].map((coins,i)=>({...sample,id:gameId+'-'+i,slug:gameId+'-'+i,name:'QA '+gameId+' '+i,votes:i===0?10:0,support:{coins,participants:coins?1:0},gameId,launch:i===3?{at:new Date(Date.now()+86400000).toISOString()}:undefined}))})
const browser=await chromium.launch(),report=[],matrix=[[320,568],[390,844],[768,1024],[1024,768],[1440,900],[844,390]]
await mkdir('output/studio-qa',{recursive:true})
try{for(const [w,h]of matrix.filter(([width])=>!process.env.STUDIO_QA_WIDTH||width===Number(process.env.STUDIO_QA_WIDTH))){const context=await browser.newContext({viewport:{width:w,height:h},reducedMotion:'reduce'}),page=await context.newPage();let writes=0
await page.route('**/api/v1/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;if(req.method()!=='GET'){writes++;return route.abort()}let json=[]
if(path.endsWith('/games'))json=games
else if(path.endsWith('/auth/me'))json={privateCore:true,providers:[],registrationOpen:false,user:{id:'qa-studio-only',displayName:'QA Administrator',roles:['PLAYER','ADMIN'],emailVerified:true,permissions:[],email:'qa@example.invalid'}}
else if(path.endsWith('/coins/me'))json={balance:25,nominalRub:50}
else if(path.endsWith('/payments/test/config'))json={available:false,testOnly:true,realSalesEnabled:false}
else if(path.includes('/support/servers/'))json={coins:0,participants:0,recent:[]}
else if(path.endsWith('/people-rating'))json=cards.map(s=>({server_id:s.id,votes:s.votes}))
else if(path.endsWith('/support/ranking'))json=cards.map(s=>({server_id:s.id,coins:s.support.coins,participants:s.support.participants}))
else if(path.endsWith('/servers')){const items=cards.filter(s=>!url.searchParams.get('gameId')||s.gameId===url.searchParams.get('gameId'));json={items,total:items.length,offset:0,limit:100}}
await route.fulfill({json})})
for(const theme of ['dark','light'])for(const game of ['lineage2','minecraft','gtarp']){
 await page.goto(base+'/rating?game='+game+'&server='+game+'-2',{waitUntil:'domcontentloaded'});await page.locator('.gs-rating-columns').waitFor();const mode=await page.evaluate(()=>document.documentElement.dataset.colorMode);if(mode!==theme)await page.getByRole('button',{name:theme==='light'?'Включить светлую тему':'Включить тёмную тему',exact:true}).click()
 await page.getByRole('button',{name:'Поддержать сервер',exact:true}).click();await page.locator('.gs-support-studio').waitFor();assert.equal(await page.locator('.gs-support-dialog').evaluate(e=>e.matches(':modal')),true)
 // Rating shows support and votes only; openings live on their own page.
 assert.equal(await page.locator('.gs-rating-columns > .gs-panel').count(),2)
 assert.equal(await page.locator('.gs-rating-columns > .gs-panel').nth(0).locator('a[href^="/server/"]').count(),4)
 assert.equal(await page.locator('.gs-rating-columns > .gs-panel').nth(1).locator('a[href^="/server/"]').count(),4)
 await page.getByLabel('Количество Coins',{exact:true}).fill('10');await page.waitForFunction(()=>document.querySelector('.gs-position-next')?.textContent==='#2–3')
 await page.getByRole('button',{name:'Поддержать за 10 Coins',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('#support')?.textContent.includes('25 GS Coins'));assert.equal(await page.getByRole('button',{name:'Поддержать за 10 Coins',exact:true}).isEnabled(),true)
 await page.getByLabel('Количество Coins',{exact:true}).fill('50');await page.waitForFunction(()=>document.querySelector('.gs-position-next')?.textContent==='#1');assert.equal(await page.getByRole('button',{name:'Поддержать за 50 Coins',exact:true}).isEnabled(),false)
 await page.getByLabel('Количество Coins',{exact:true}).fill('0');assert.equal(await page.locator('.gs-position-next').count(),0);assert.equal(await page.getByRole('button',{name:'Поддержать за 0 Coins',exact:true}).isEnabled(),false)
 await page.getByLabel('Количество Coins',{exact:true}).fill('25');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.equal(await page.locator('.gs-position-next').evaluate(e=>getComputedStyle(e).animationName),'none')
 await page.locator('.gs-support-studio').scrollIntoViewIfNeeded();await page.screenshot({path:`output/studio-qa/studio-${game}-${theme}-${w}.png`,fullPage:false})
 await page.getByRole('button',{name:'Закрыть поддержку',exact:true}).click();assert.equal(await page.locator('.gs-support-dialog').count(),0);assert.equal(await page.getByRole('button',{name:'Поддержать сервер',exact:true}).evaluate(e=>e===document.activeElement),true);await page.getByRole('button',{name:'Поддержать сервер',exact:true}).click();await page.getByLabel('Количество Coins',{exact:true}).press('Escape');assert.equal(await page.locator('.gs-support-dialog').count(),0);await page.getByRole('button',{name:'Поддержать сервер',exact:true}).click();
 report.push({w,h,theme,game,zeros:true,preview:true,balanceGuard:true,noWrites:true,modal:true,escape:true,focusReturn:true})
}
if(w===1440){await page.emulateMedia({reducedMotion:'no-preference'});await page.getByLabel('Количество Coins',{exact:true}).fill('5');await page.getByLabel('Количество Coins',{exact:true}).fill('100');assert.notEqual(await page.locator('.gs-position-next').evaluate(e=>getComputedStyle(e).animationName),'none');await page.emulateMedia({reducedMotion:'reduce'})}
assert.equal(writes,0)
await context.addInitScript(()=>localStorage.setItem('gs.visual-demo','1'));await page.goto(base+'/rating?game=lineage2',{waitUntil:'domcontentloaded'});await page.locator('.gs-demo-banner').waitFor();await page.getByRole('button',{name:'Поддержать сервер',exact:true}).click();await page.locator('.gs-support-studio').waitFor();assert.equal(await page.locator('#support-studio #support').count(),0);assert.equal(await page.getByRole('button',{name:/^Поддержать за/}).count(),0)
if(w===844){await page.getByRole('button',{name:'Закрыть поддержку',exact:true}).click();await page.clock.install();await page.clock.fastForward(16000);let release;const held=new Promise(r=>release=r);await page.route('**/api/v1/servers*',async route=>{await held;await route.fulfill({json:{items:cards.filter(s=>s.gameId==='lineage2'),total:4,offset:0,limit:100}})});await page.getByRole('button',{name:'Выключить',exact:true}).click();await page.getByRole('button',{name:'Поддержать сервер',exact:true}).click();assert.equal(await page.locator('.gs-support-studio').count(),0);assert.equal(await page.getByRole('button',{name:/^Поддержать за/}).count(),0);release();await page.locator('.gs-support-studio').waitFor();console.log('PASS mode switch: demo forecast/actions hidden until real catalogue arrives')}
await context.close();console.log(`PASS studio ${w}x${h}: 3 games, dark/light, zeros, tie range, balance/invalid guards, reduced motion, demo/no writes`)
}await writeFile('output/studio-qa/report.json',JSON.stringify(report,null,2))}finally{await browser.close();if(server)await new Promise(r=>server.close(r))}
