import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// One gateway host keeps first-party cookies while the public catalog stays in D1.
// Unknown API paths fail closed instead of reaching the legacy D1 account/vote code.
export const apiRoutes = [
  { path:'/api/v1/games', method:'get', target:'public' },
  { path:'/api/v1/servers', method:'get', target:'public' },
  { path:'/api/v1/servers/{key}', method:'get', target:'public', param:'key' },
  { path:'/api/v1/servers/{key}/online-history', method:'get', target:'public', param:'key' },
  { path:'/api/v1/rating', method:'get', target:'public' },
  { path:'/api/v1/support/ranking', method:'get', target:'public' },
  { path:'/api/v1/sitemap.xml', method:'get', target:'public' },
  { path:'/api/v1/health', method:'any', target:'private' },
  { path:'/api/v1/auth/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/v1/me/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/v1/claims', method:'any', target:'private' },
  { path:'/api/v1/claims/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/v1/owners/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/v1/servers/{id}/manage-access', method:'any', target:'private', param:'id' },
  { path:'/api/v1/people-rating', method:'any', target:'private' },
  { path:'/api/v1/people-rating/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/v1/coins/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/v1/payments/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/v1/support', method:'any', target:'private' },
  { path:'/api/v1/support/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/v1/admin/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/v1/copyright/{path+}', method:'any', target:'private', param:'path' },
  { path:'/api/{path+}', method:'any', target:'deny', param:'path' },
]

function routeYaml(route,vm=false) {
  const method=route.method==='any'?'x-yc-apigateway-any-method':route.method
  const lines=[`  ${route.path}:`, `    ${method}:`]
  if (route.param) lines.push('      parameters:',`        - name: ${route.param}`,'          in: path',`          required: ${route.param==='path'?'false':'true'}`,'          schema:','            type: string')
  lines.push('      x-yc-apigateway-integration:')
  if (route.target==='private' && vm) {
    // Private API on the VM behind Caddy. Headers and query are NOT forwarded by default: pass them all,
    // then let the fixed X-GS-Gateway header override any client-supplied value.
    const url=`__PRIVATE_ORIGIN__${route.path.replace('{path+}','{path}')}`
    lines.push('        type: http',`        url: ${url}`,'        headers:',"          '*': '*'",'          Host: __PRIVATE_HOST__','          X-GS-Gateway: __PRIVATE_GATEWAY_SECRET__','        query:',"          '*': '*'",'        omitEmptyHeaders: true','        omitEmptyQueryParameters: true','        timeouts:','          connect: 3','          read: 25')
  } else if (route.target==='private') lines.push('        type: serverless_containers','        container_id: __PRIVATE_CONTAINER_ID__','        service_account_id: __PRIVATE_GATEWAY_SERVICE_ACCOUNT_ID__')
  else if (route.target==='public') lines.push('        type: cloud_functions','        function_id: __FUNCTION_ID__','        service_account_id: __SERVICE_ACCOUNT_ID__',"        payload_format_version: '1.0'")
  else lines.push('        type: dummy','        http_code: 404','        http_headers:','          Content-Type: application/json','          Cache-Control: no-store','        content:',"          '*': '{\"error\":{\"code\":\"route_unavailable\",\"message\":\"API route unavailable\"}}'")
  return lines.join('\n')
}

/** Minimal cutover: the live gateway template stays as it is; only its /api/{path+} block becomes the public/private split. */
export function renderApiSplit(liveTemplate,{vm=true}={}) {
  const start=liveTemplate.indexOf('  /api/{path+}:'), end=liveTemplate.indexOf('  /__gs/health:')
  if (start<0 || end<start) throw new Error('unexpected_live_gateway_spec')
  return `${liveTemplate.slice(0,start)}${apiRoutes.map(route=>routeYaml(route,vm)).join('\n')}\n${liveTemplate.slice(end)}`
}

/** Keep the deployed API split byte-for-byte; replace only the SPA fallback with prerender routing. */
export function renderSeoSplit(privateTemplate,staticCandidate) {
  const fallback='  /{file+}:'
  const staticStart=staticCandidate.indexOf('  /assets/{file+}:')
  const privateStart=privateTemplate.indexOf(fallback)
  if (staticStart<0 || privateStart<0 || !privateTemplate.includes('  /api/v1/auth/{path+}:'))
    throw new Error('unexpected_gateway_spec')
  const oldFallback=privateTemplate.slice(privateStart)
  if (!oldFallback.includes("object: '{file}'") || !/statusCode: 200\s/.test(oldFallback))
    throw new Error('unexpected_spa_fallback')
  const bucket=/^        bucket: ([^\r\n]+)$/m.exec(oldFallback)?.[1]
  const account=/^        service_account_id: ([^\r\n]+)$/m.exec(oldFallback)?.[1]
  if (!bucket || !account) throw new Error('missing_static_credentials')
  const staticTail=staticCandidate.slice(staticStart)
    .replaceAll('__BUCKET__',bucket).replaceAll('__SERVICE_ACCOUNT_ID__',account)
  if (!staticTail.includes("object: '{file}/index.html'") || !staticTail.includes('statusCode: 404'))
    throw new Error('unexpected_prerender_spec')
  return privateTemplate.slice(0,privateStart)+staticTail
}

export function renderPrivateGateway(staticCandidate,{vm=false}={}) {
  const marker='  /assets/{file+}:'
  const staticStart=staticCandidate.indexOf(marker)
  if (staticStart<0 || !staticCandidate.includes('  /api/{path+}:')) throw new Error('unexpected_static_gateway_spec')
  const staticTail=staticCandidate.slice(staticStart).trimEnd()
  const heading=(vm?`# Candidate only: private routes go over HTTPS to the VM (Caddy), not to a serverless container.
`:'')+`# Candidate only: replace placeholders and validate on an isolated staging gateway.\n# No production routing or DNS changes are performed by this file.\n# The private container remains IAM-only; /__internal/* is never routed.\nopenapi: 3.0.0\ninfo:\n  title: gamescout-ru-private-candidate\n  version: 1.0.0\npaths:\n  /:\n    get:\n      x-yc-apigateway-integration:\n        type: object_storage\n        bucket: __BUCKET__\n        object: index.html\n        service_account_id: __SERVICE_ACCOUNT_ID__\n`
  const legacyHealth=`  /__gs/health:\n    get:\n      x-yc-apigateway-integration:\n        type: cloud_functions\n        function_id: __FUNCTION_ID__\n        service_account_id: __SERVICE_ACCOUNT_ID__\n        payload_format_version: '1.0'`
  return `${heading}${apiRoutes.map(route=>routeYaml(route,vm)).join('\n')}\n${legacyHealth}\n${staticTail}\n`
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const source=await readFile(new URL('../ru-proxy/yandex/gateway.prerender.template.yaml',import.meta.url),'utf8')
  if (process.argv.includes('--seo-from')) {
    const input=process.argv[process.argv.indexOf('--seo-from')+1]
    const output=process.argv[process.argv.indexOf('--out')+1]
    if (!input || !output || input.startsWith('--') || output.startsWith('--'))
      throw new Error('Usage: --seo-from EXPORTED_LIVE_SPEC --out PRIVATE_CANDIDATE_PATH')
    // Both files contain the live gateway secret. Keep them outside Git with owner-only access.
    const live=await readFile(input,'utf8')
    const rendered=renderSeoSplit(live,source)
    await writeFile(output,rendered,{ flag:'wx', mode:0o600 })
    console.log('SEO gateway candidate written; API routes preserved')
    process.exit(0)
  }
  if (process.argv.includes('--seo-minimal')) {
    const lf=text=>text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10))
    const live=lf(await readFile(new URL('../ru-proxy/yandex/gateway.vm-min.template.yaml',import.meta.url),'utf8'))
    const target=new URL('../ru-proxy/yandex/gateway.vm-seo.template.yaml',import.meta.url)
    const rendered=renderSeoSplit(live,lf(source))
    if (process.argv.includes('--write')) await writeFile(target,rendered)
    else if (lf(await readFile(target,'utf8'))!==rendered) throw new Error('gateway_vm_seo_out_of_date')
    process.exit(0)
  }
  if (process.argv.includes('--minimal')) {
    const lf=text=>text.split(String.fromCharCode(13,10)).join(String.fromCharCode(10))
    const live=lf(await readFile(new URL('../ru-proxy/yandex/gateway.template.yaml',import.meta.url),'utf8'))
    const target=new URL('../ru-proxy/yandex/gateway.vm-min.template.yaml',import.meta.url), minimal=renderApiSplit(live)
    if (process.argv.includes('--write')) await writeFile(target,minimal)
    else if (lf(await readFile(target,'utf8'))!==minimal) throw new Error('gateway_vm_min_out_of_date')
    process.exit(0)
  }
  const vm=process.argv.includes('--vm')
  const output=new URL(vm?'../ru-proxy/yandex/gateway.vm.template.yaml':'../ru-proxy/yandex/gateway.private.template.yaml',import.meta.url)
  const rendered=renderPrivateGateway(source,{vm})
  if (process.argv.includes('--write')) await writeFile(output,rendered)
  else if (process.argv.includes('--check')) {
    if (await readFile(output,'utf8')!==rendered) throw new Error('gateway_private_candidate_out_of_date')
  } else throw new Error('Use --check or --write')
}
