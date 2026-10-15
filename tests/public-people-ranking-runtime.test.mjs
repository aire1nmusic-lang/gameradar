import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('public votes run in actual workerd, strip credentials, and refuse redirects', async () => {
  const entry = `import {publicPeopleRanking} from ${JSON.stringify(resolve('worker/lib/people-ranking.ts'))};
    const errors=[];const realFetch=fetch;globalThis.fetch=async(...args)=>{try{return await realFetch(...args)}catch(e){errors.push(e.message);throw e}};
    export default {async fetch(){try{return Response.json(await publicPeopleRanking(new URLSearchParams('limit=1')))}catch(e){return Response.json({error:e.code,transport:errors},{status:e.status||500})}}}`
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser' })
  let outbound = 0, redirect = false
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-01', outboundService: async request => {
    outbound++
    assert.equal(new URL(request.url).hostname, 'priv.gamescout.online')
    assert.equal(request.headers.get('cookie'), null); assert.equal(request.headers.get('authorization'), null)
    return redirect ? new Response('', { status: 302, headers: { Location: 'https://untrusted.invalid' } }) : Response.json([{ server_id: 'one', votes: 7, user_id: 'not-public' }])
  } }))
  try {
    const first = await mf.dispatchFetch('http://local')
    const body = await first.json()
    assert.equal(first.status, 200, JSON.stringify(body))
    assert.deepEqual(body, [{ server_id: 'one', votes: 7 }])
    const before = outbound; redirect = true
    const second = await mf.dispatchFetch('http://local')
    assert.equal(second.status, 503)
    assert.equal(outbound - before, 1, 'No redirect fetches to arbitrary hosts')
  } finally { await mf.dispose() }
})
