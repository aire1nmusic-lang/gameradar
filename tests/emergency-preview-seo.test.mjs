import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../workers/emergency-preview.mjs'

test('edge serves each prerendered page and real 404 without touching API routing', async () => {
  const calls=[]
  const env={ASSETS:{fetch:async request=>{
    const path=new URL(request.url).pathname
    calls.push(path)
    const found=['/index.html','/lineage-2/index.html','/minecraft/index.html','/gta-rp/index.html','/server/example/index.html','/account/index.html','/assets/app.js','/404.html'].includes(path)
    return new Response(found ? path : '<meta name="robots" content="noindex, nofollow">Страница не найдена',{status:found?200:404,headers:{'Content-Type':path.endsWith('.js')?'text/javascript':'text/html'}})
  }}, GAME_API:{fetch:async request=>{
    assert.equal(new URL(request.url).pathname,'/api/v1/servers')
    return Response.json({items:[]})
  }}}
  for (const path of ['/','/lineage-2','/minecraft','/gta-rp','/server/example','/account','/account/','/assets/app.js']) {
    const response=await worker.fetch(new Request('https://gamescout.online'+path),env)
    assert.equal(response.status,200,path)
    const body=await response.text()
    if(path==='/') assert.equal(body,'/index.html')
    else assert.notEqual(body,'/index.html',path)
  }
  for (const path of ['/missing','/server/missing','/missing/','/assets/missing.js','/404.html']) {
    const response=await worker.fetch(new Request('https://gamescout.online'+path),env)
    assert.equal(response.status,404,path)
    assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow')
    assert.equal(response.headers.get('Cache-Control'),'no-store')
  }
  assert.equal((await worker.fetch(new Request('https://gamescout.online/api/v1/servers'),env)).status,200)
  const before=calls.length
  assert.equal((await worker.fetch(new Request('https://gamescout.online/api/v1/auth/me'),env)).status,404)
  assert.equal((await worker.fetch(new Request('https://gamescout.online/api/v1/servers',{method:'POST'}),env)).status,405)
  assert.equal(calls.length,before)
})
