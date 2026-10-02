import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apiRoutes, renderApiSplit, renderPrivateGateway, renderSeoSplit } from '../scripts/yandex-private-gateway.mjs'

// Windows checkouts turn LF into CRLF; the comparison is about content, not line endings.
const lf=text=>text.split('\r\n').join('\n')
const candidate=lf(readFileSync('ru-proxy/yandex/gateway.private.template.yaml','utf8'))

function matches(pattern,path) {
  const parts=pattern.split('/').filter(Boolean), actual=path.split('/').filter(Boolean)
  let index=0
  for (const part of parts) {
    if (part.endsWith('+}')) return actual.length>index
    if (index>=actual.length) return false
    if (!part.startsWith('{') && part!==actual[index]) return false
    index++
  }
  return index===actual.length
}

function chosen(path,method) {
  const hits=apiRoutes.filter(route=>(route.method==='any'||route.method===method)&&matches(route.path,path))
  // Yandex: fixed > parameterized > greedy; longer greedy route wins.
  hits.sort((a,b)=>{
    const rank=route=>route.path.includes('+}')?0:route.path.includes('{')?1:2
    return rank(b)-rank(a)||b.path.split('/').length-a.path.split('/').length
  })
  return hits[0]?.target
}

test('candidate generated from current static routes',()=>{
  const staticSpec=lf(readFileSync('ru-proxy/yandex/gateway.prerender.template.yaml','utf8'))
  assert.equal(candidate,renderPrivateGateway(staticSpec))
  assert.equal((candidate.match(/  \/api\//g)??[]).length,apiRoutes.length)
  assert.ok(!candidate.includes('  /__internal/'))
  assert.match(candidate,/container_id: __PRIVATE_CONTAINER_ID__/)
  assert.match(candidate,/type: dummy\n        http_code: 404/)
})

test('all private API declarations route to container, except shared public aggregate',()=>{
  const app=readFileSync('private-api/app.mjs','utf8')
  const calls=[...app.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)]
  assert.ok(calls.length>=45)
  for (const [,method,route] of calls) {
    if(route==='*'||route.startsWith('/api/v1/__dev/')) continue
    const path=route.replace(/:[a-zA-Z]+/g,'sample')
    const target=route==='/api/v1/support/ranking'?'public':'private'
    assert.equal(chosen(path,method),target,`${method.toUpperCase()} ${route}`)
  }
})

test('only catalog reads reach legacy D1 relay; retired writes fail closed',()=>{
  for (const path of ['/api/v1/games','/api/v1/servers','/api/v1/servers/card','/api/v1/servers/card/online-history',
    '/api/v1/rating','/api/v1/support/ranking','/api/v1/sitemap.xml']) assert.equal(chosen(path,'get'),'public',path)
  for (const [path,method] of [['/api/v1/servers','post'],['/api/v1/servers/card','patch'],
    ['/api/v1/votes','post'],['/api/v1/votes/eligibility','get'],['/api/v1/servers/card/stats','get'],
    ['/api/v1/servers/card/reward','get'],['/api/v1/events','post'],['/api/v1/auth/dev','post'],
    ['/api/v1/__dev/coins','post'],['/api/v1/unknown','get']]) {
    const expected=path==='/api/v1/auth/dev'?'private':'deny'
    assert.equal(chosen(path,method),expected,`${method.toUpperCase()} ${path}`)
  }
  assert.equal(chosen('/api/v1/servers/card/manage-access','get'),'private')
  assert.equal(chosen('/api/v1/support/servers/card','get'),'private')
})

test('VM candidate sends every private route over HTTPS with the gateway secret and no container',()=>{
  const staticSpec=lf(readFileSync('ru-proxy/yandex/gateway.prerender.template.yaml','utf8'))
  const vm=lf(readFileSync('ru-proxy/yandex/gateway.vm.template.yaml','utf8'))
  assert.equal(vm,renderPrivateGateway(staticSpec,{vm:true}))
  const privateRoutes=apiRoutes.filter(route=>route.target==='private').length
  assert.equal((vm.match(/type: http\n/g)??[]).length,privateRoutes)
  assert.equal((vm.match(/X-GS-Gateway: __PRIVATE_GATEWAY_SECRET__/g)??[]).length,privateRoutes)
  assert.ok(!vm.includes('serverless_containers'))
  assert.ok(!vm.includes('  /__internal/'))
  assert.match(vm,/url: __PRIVATE_ORIGIN__\/api\/v1\/auth\/\{path\}/)
  assert.match(vm,/type: dummy\n        http_code: 404/)
})

test('minimal cutover keeps the live gateway and swaps only the /api block',()=>{
  const live=lf(readFileSync('ru-proxy/yandex/gateway.template.yaml','utf8'))
  const minimal=lf(readFileSync('ru-proxy/yandex/gateway.vm-min.template.yaml','utf8'))
  assert.equal(minimal,renderApiSplit(live))
  assert.ok(minimal.startsWith(live.slice(0,live.indexOf('  /api/{path+}:'))))
  assert.ok(minimal.endsWith(live.slice(live.indexOf('  /__gs/health:'))))
  assert.ok(!minimal.includes('serverless_containers'))
  assert.equal((minimal.match(/type: http\n/g)??[]).length,apiRoutes.filter(route=>route.target==='private').length)
})

test('SEO gateway keeps the private API split and replaces only the SPA fallback',()=>{
  const privateSpec=lf(readFileSync('ru-proxy/yandex/gateway.vm-min.template.yaml','utf8'))
  const staticSpec=lf(readFileSync('ru-proxy/yandex/gateway.prerender.template.yaml','utf8'))
  const seoSpec=lf(readFileSync('ru-proxy/yandex/gateway.vm-seo.template.yaml','utf8'))
  assert.equal(seoSpec,renderSeoSplit(privateSpec,staticSpec))
  assert.equal(seoSpec.slice(0,seoSpec.indexOf('  /assets/{file+}:')),
    privateSpec.slice(0,privateSpec.indexOf('  /{file+}:')))
  assert.match(seoSpec,/object: '\{file\}\/index\.html'/)
  assert.match(seoSpec,/statusCode: 404/)
  assert.ok(!seoSpec.includes('object: index.html\n          statusCode: 200'))
  assert.equal((seoSpec.match(/X-GS-Gateway: __PRIVATE_GATEWAY_SECRET__/g)??[]).length,
    (privateSpec.match(/X-GS-Gateway: __PRIVATE_GATEWAY_SECRET__/g)??[]).length)
  const configured=privateSpec.replaceAll('__BUCKET__','live-bucket').replaceAll('__SERVICE_ACCOUNT_ID__','live-service-account')
  const configuredSeo=renderSeoSplit(configured,staticSpec)
  assert.ok(!configuredSeo.includes('__BUCKET__'))
  assert.ok(!configuredSeo.includes('__SERVICE_ACCOUNT_ID__'))
  assert.match(configuredSeo,/bucket: live-bucket/)
  assert.throws(()=>renderSeoSplit(privateSpec.replace("object: '{file}'",'object: other.html'),staticSpec),/unexpected_spa_fallback/)
})
