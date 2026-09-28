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

function routeYaml(route) {
  const method=route.method==='any'?'x-yc-apigateway-any-method':route.method
  const lines=[`  ${route.path}:`, `    ${method}:`]
  if (route.param) lines.push('      parameters:',`        - name: ${route.param}`,'          in: path',`          required: ${route.param==='path'?'false':'true'}`,'          schema:','            type: string')
  lines.push('      x-yc-apigateway-integration:')
  if (route.target==='private') lines.push('        type: serverless_containers','        container_id: __PRIVATE_CONTAINER_ID__','        service_account_id: __PRIVATE_GATEWAY_SERVICE_ACCOUNT_ID__')
  else if (route.target==='public') lines.push('        type: cloud_functions','        function_id: __FUNCTION_ID__','        service_account_id: __SERVICE_ACCOUNT_ID__',"        payload_format_version: '1.0'")
  else lines.push('        type: dummy','        http_code: 404','        http_headers:','          Content-Type: application/json','          Cache-Control: no-store','        content:',"          '*': '{\"error\":{\"code\":\"route_unavailable\",\"message\":\"API route unavailable\"}}'")
  return lines.join('\n')
}

export function renderPrivateGateway(staticCandidate) {
  const marker='  /assets/{file+}:'
  const staticStart=staticCandidate.indexOf(marker)
  if (staticStart<0 || !staticCandidate.includes('  /api/{path+}:')) throw new Error('unexpected_static_gateway_spec')
  const staticTail=staticCandidate.slice(staticStart).trimEnd()
  const heading=`# Candidate only: replace placeholders and validate on an isolated staging gateway.\n# No production routing or DNS changes are performed by this file.\n# The private container remains IAM-only; /__internal/* is never routed.\nopenapi: 3.0.0\ninfo:\n  title: gamescout-ru-private-candidate\n  version: 1.0.0\npaths:\n  /:\n    get:\n      x-yc-apigateway-integration:\n        type: object_storage\n        bucket: __BUCKET__\n        object: index.html\n        service_account_id: __SERVICE_ACCOUNT_ID__\n`
  const legacyHealth=`  /__gs/health:\n    get:\n      x-yc-apigateway-integration:\n        type: cloud_functions\n        function_id: __FUNCTION_ID__\n        service_account_id: __SERVICE_ACCOUNT_ID__\n        payload_format_version: '1.0'`
  return `${heading}${apiRoutes.map(routeYaml).join('\n')}\n${legacyHealth}\n${staticTail}\n`
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const source=await readFile(new URL('../ru-proxy/yandex/gateway.prerender.template.yaml',import.meta.url),'utf8')
  const output=new URL('../ru-proxy/yandex/gateway.private.template.yaml',import.meta.url)
  const rendered=renderPrivateGateway(source)
  if (process.argv.includes('--write')) await writeFile(output,rendered)
  else if (process.argv.includes('--check')) {
    if (await readFile(output,'utf8')!==rendered) throw new Error('gateway_private_candidate_out_of_date')
  } else throw new Error('Use --check or --write')
}
