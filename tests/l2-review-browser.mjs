import {readPublicGames,readPublicCatalog} from './public-qa-data.mjs'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { chromium } from 'playwright'

const live=process.env.REVIEW_QA_BASE_URL,root=resolve('dist');let server
if(!live){server=createServer(async(req,res)=>{try{let p=resolve(root,'.'+new URL(req.url,'http://local').pathname);assert.ok(p.startsWith(root+sep));if(!extname(p))p+='/index.html';let body;try{body=await readFile(p)}catch{p=root+'/index.html';body=await readFile(p)}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(4189,'127.0.0.1',r))}
const base=live||'http://127.0.0.1:4189',games=await readPublicGames(),catalog=await readPublicCatalog()
const sample=catalog.items.find(s=>s.gameId==='lineage2'),rows=Array.from({length:30},(_,i)=>({...sample,id:`review-${i}`,slug:`review-${i}`,name:`Review ${i}`,votes:5+i,support:{coins:i<3?3-i:0,participants:1},launch:{at:new Date(Date.now()+3600000+i*86400000).toISOString()}}))
const browser=await chromium.launch(),report=[];let active
await mkdir('output/l2-review-qa',{recursive:true})
async function intercept(page,missing='none',peopleGate){
 await page.route('**/api/v1/**',async route=>{assert.equal(route.request().method(),'GET','Review makes no writes');const u=new URL(route.request().url()),p=u.pathname;let json=[],status=200
 if(p.endsWith('/games'))json=games
 else if(p.endsWith('/auth/me'))json={privateCore:true,user:null,providers:[],registrationOpen:false}
 else if(p.endsWith('/servers')){const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||100);json={items:rows.slice(offset,offset+limit),total:rows.length,offset,limit}}
 else if(p.endsWith('/people-rating')){if(peopleGate)await peopleGate;json=rows.map(s=>({server_id:s.id,votes:s.votes}));if(missing==='people'||missing==='both')status=503}
 else if(p.endsWith('/support/ranking')){json=rows.map(s=>({server_id:s.id,...s.support}));if(missing==='support'||missing==='both')status=503}
 await route.fulfill({json,status})})
}
try{
 for(const[w,h]of [[320,568],[390,844],[768,1024],[1024,768],[1440,900],[844,390]])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width:w,height:h}}),page=await context.newPage();active=page;await intercept(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(base+'/lineage-2',{waitUntil:'domcontentloaded'});await page.locator('.l2a .server').first().waitFor()
  if(await page.evaluate(()=>document.documentElement.dataset.colorMode)!==theme)await page.getByRole('button',{name:theme==='light'?'Включить светлую тему':'Включить тёмную тему',exact:true}).click()
  assert.deepEqual(await page.locator('.gs-mobile-nav a').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label'))),['Главная','Серверы','Открытия','Рейтинг','Избранное'])
  assert.equal(await page.locator('.l2a button').getByText('Избранное',{exact:true}).count(),0)
  assert.equal(await page.locator('.l2a .metrics').innerText().then(s=>s.includes('—')),false)
  assert.equal(await page.locator('.gs-site-header .gs-header-search').filter({visible:true}).count(),0,'One search per page: the world page has its own')
  const support=page.locator('.l2a .support')
  assert.equal(await support.locator('.server:visible').count(),5,'Five rows on every device')
  assert.equal(await support.locator('.gs-top-row').count(),3,'Distinct first three positions')
  for(const row of await support.locator('.gs-top-row').all()){
    const favorite=row.locator('.fav')
    await favorite.evaluate(button=>button.scrollIntoView({block:'center',behavior:'instant'}))
    await page.clock.runFor(32)
    const target=await favorite.evaluate(button=>{const r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {clickable:hit===button||button.contains(hit),hit:hit?.outerHTML.slice(0,180),rect:{x:r.x,y:r.y,width:r.width,height:r.height}}})
    assert.equal(target.clickable,true,`Favorite remains above metrics and artwork: ${w}x${h}/${theme} ${JSON.stringify(target)}`)
    assert.equal(await row.locator('.server-name').evaluate(e=>getComputedStyle(e).color),theme==='light'?'rgb(29, 27, 32)':'rgb(246, 243, 239)','Podium name uses the ink of its theme')
    assert.notEqual(await row.locator('.gs-rank-podium').evaluate(e=>getComputedStyle(e).backgroundImage),'none','Visible medal surface')
    const rect=await row.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=w,'Podium remains in viewport')
  }
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:`output/l2-review-qa/home-${w}-${theme}.png`,fullPage:true})
  assert.equal(await page.locator('.chronicle-picker').getAttribute('open'),'','Epoch tiles are open without a click')
  await page.waitForFunction(()=>[...document.querySelectorAll('.chronicle-picker img')].every(i=>i.complete&&i.naturalWidth>0));const images=await page.locator('.chronicle-picker img').evaluateAll(els=>els.map(e=>({width:e.getBoundingClientRect().width,loaded:e.complete&&e.naturalWidth>0})));assert.ok(images.length>=5);assert.ok(images.every(i=>i.width>=120&&i.loaded),'Epoch tiles carry real artwork')
  await page.screenshot({path:`output/l2-review-qa/chronicles-${w}-${theme}.png`,fullPage:true})
  await page.goto(base+'/rating?game=lineage2',{waitUntil:'domcontentloaded'});await page.locator('.gs-rating-support .gs-row').first().waitFor();await page.getByRole('button',{name:'Поиск',exact:true}).click();const search=page.getByRole('dialog',{name:'Поиск серверов'});await search.waitFor();assert.equal(await search.locator('input').evaluate(e=>getComputedStyle(e).color),theme==='light'?'rgb(38, 48, 57)':'rgb(243, 239, 229)');await page.screenshot({path:`output/l2-review-qa/search-${w}-${theme}.png`});await search.locator('input').press('Escape')
  await page.goto(base+'/catalog?game=lineage2',{waitUntil:'domcontentloaded'});await page.locator('.gs-catalog-page .gs-row').first().waitFor();assert.ok((await page.locator('.gs-filter-trigger').boundingBox()).height<=44)
  await page.getByRole('button',{name:'Фильтры',exact:true}).click();await page.getByRole('dialog',{name:'Фильтры'}).waitFor();await page.screenshot({path:`output/l2-review-qa/filters-${w}-${theme}.png`});await page.keyboard.press('Escape')
  await page.goto(base+'/rating?game=lineage2',{waitUntil:'domcontentloaded'});await page.locator('.gs-rating-support .gs-row').first().waitFor()
  assert.equal(await page.locator('main .gs-ranking-explanation,main .gs-rating-about,main .support-note').count(),0,'Explanations moved to footer')
  const toolbar=await page.locator('.gs-rating-tools').boundingBox();assert.ok(toolbar.x>=0&&toolbar.x+toolbar.width<=w,'Rating tools fit viewport')
  if(w<1024){const tabs=await page.locator('.gs-rating-switch').boundingBox(),launch=await page.locator('.gs-support-launch').boundingBox();assert.ok(launch.y>=tabs.y+tabs.height,'Rating action below the switch');for(const button of await page.locator('.gs-rating-switch button').all()){const b=await button.boundingBox();assert.ok(b.x>=tabs.x&&b.x+b.width<=tabs.x+tabs.width+1,'Every tab remains inside switch')}}
  await page.screenshot({path:`output/l2-review-qa/rating-${w}-${theme}.png`,fullPage:true})
  await page.getByRole('button',{name:'Поддержать сервер',exact:true}).click();const studio=page.getByRole('dialog',{name:'Поддержать сервер',exact:true});await studio.waitFor()
  const box=await studio.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=w&&box.y>=0&&box.y+box.height<=h,'Studio fits viewport')
  assert.equal(await studio.locator('.gs-projection-list').evaluate(e=>getComputedStyle(e).overflowY),'clip','Reordering clips to the list without a nested scrollbar')
  await studio.getByRole('button',{name:'25',exact:true}).click();assert.equal(await studio.getByLabel('Количество Coins',{exact:true}).inputValue(),'25');assert.equal(await studio.getByRole('button',{name:'25',exact:true}).getAttribute('aria-pressed'),'true')
  assert.equal(await studio.locator('details').count(),0,'Explanation moved out of studio')
  assert.equal(await studio.locator('.gs-projection-row').evaluateAll(rows=>rows.flatMap(row=>row.getAnimations()).length),0,'Changing amount without reordering cannot animate dialog movement')
  const regions=await studio.evaluate(dialog=>{const rect=s=>{const r=dialog.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}};return {form:rect('.gs-support-form'),preview:rect('.gs-support-preview'),summary:rect('.gs-position-summary'),list:rect('.gs-projection-list'),checkout:rect('.gs-support-checkout')}})
  if(w<768){assert.ok(regions.preview.top>=regions.form.bottom-1,'Preview follows form');assert.ok(regions.checkout.top>=regions.preview.bottom-1,'Checkout follows preview')}
  assert.ok(regions.list.top>=regions.summary.bottom-1,'Rows remain below summary')
  await studio.locator('.gs-support-select').selectOption('review-29')
  await studio.locator('.gs-projection-list').evaluate(async list=>{await Promise.all(list.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})))})
  const firstRow=await studio.locator('.gs-projection-row').first().boundingBox(),listBox=await studio.locator('.gs-projection-list').boundingBox();assert.ok(firstRow.y>=listBox.y-1,'Settled rows remain inside list')
  await studio.evaluate(e=>e.scrollTop=0)

  await page.screenshot({path:`output/l2-review-qa/support-${w}-${theme}.png`});await studio.evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:`output/l2-review-qa/support-end-${w}-${theme}.png`});await page.keyboard.press('Escape')
  const faq=page.locator('.gs-footer-faq');assert.equal(await faq.getAttribute('open'),null);await faq.locator(':scope > summary').click();const question=faq.locator('.gs-faq-questions > details').first();await question.locator('summary').click();await question.locator('p').waitFor();assert.ok((await question.locator('p').innerText()).includes('одной трети'));await page.screenshot({path:`output/l2-review-qa/faq-${w}-${theme}.png`});await faq.locator(':scope > summary').click()
  await page.goto(base+'/openings?game=lineage2',{waitUntil:'domcontentloaded'});const timer=page.getByRole('timer').first();await timer.waitFor();const before=await timer.innerText();assert.match(before,/(?:\d+ д )?\d{2}:\d{2}:\d{2}/);await page.clock.fastForward(1100);assert.notEqual(await timer.innerText(),before);await page.screenshot({path:`output/l2-review-qa/openings-${w}-${theme}.png`,fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await context.close();report.push({w,h,theme,timer:true,controls:true});console.log('PASS L2 device review',w,h,theme)
 }
 let releasePeople;const peopleGate=new Promise(resolve=>{releasePeople=resolve})
 const slowContext=await browser.newContext({viewport:{width:390,height:844}}),slowPage=await slowContext.newPage();active=slowPage
 await intercept(slowPage,'none',peopleGate)
 await slowPage.goto(base+'/lineage-2',{waitUntil:'domcontentloaded'})
 await slowPage.locator('.l2a .support .server').first().waitFor({timeout:5000})
 assert.equal(await slowPage.locator('.l2a .support .server:visible').count(),5,'Stalled ranking cannot block cards')
 assert.equal(await slowPage.locator('.gs-ranking-availability').count(),0,'Pending enrichment is not an outage')
 releasePeople();await slowContext.close();console.log('PASS catalog paints before stalled private ranking')
 for(const missing of ['people','support','both']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();active=page;await intercept(page,missing)
  await page.goto(base+'/lineage-2',{waitUntil:'domcontentloaded'});await page.locator('.l2a .support .server').first().waitFor();assert.equal(await page.locator('.l2a .support .server').count(),30);await page.locator('.gs-ranking-availability').waitFor();assert.equal(await page.getByText('Не удалось загрузить данные',{exact:true}).count(),0)
  await page.goto(base+'/catalog?game=lineage2',{waitUntil:'domcontentloaded'});await page.locator('.gs-catalog-page .gs-row').first().waitFor();await page.locator('.gs-ranking-availability').waitFor()
  await page.goto(base+'/rating?game=lineage2',{waitUntil:'domcontentloaded'});await page.locator('.gs-rating-support a[href^="/server/"]').first().waitFor();assert.equal(await page.getByRole('button',{name:'Поддержать сервер',exact:true}).isEnabled(),missing==='people');await context.close();console.log('PASS live aggregate 503 keeps cards,',missing)
 }
 await writeFile('output/l2-review-qa/report.json',JSON.stringify(report,null,2))
}catch(e){if(active&&!active.isClosed()){await active.screenshot({path:'output/l2-review-qa/failure.png',fullPage:true});console.log('FAILED',active.url())}throw e}finally{await browser.close();if(server)await new Promise(r=>server.close(r))}

