import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
const bundled = await build({ entryPoints: ['src/services/publicRanking.ts'], bundle: true, write: false, format: 'esm', platform: 'node', alias: { '@': resolve('src') } })
const { readPeopleRanking, readPublicRanking } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const originalFetch = globalThis.fetch
const json = rows => new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json' } })
test('profile vote totals include server 101 and preserve global order and zero totals', async () => {
  try {
    const calls = []
    globalThis.fetch = async url => {
      const u = new URL(url, 'https://local.invalid'); calls.push(u.searchParams.get('offset'))
      const offset = Number(u.searchParams.get('offset'))
      return json(Array.from({ length: offset === 0 ? 100 : 2 }, (_, i) => ({ server_id: `s-${offset+i}`, votes: 101-offset-i })))
    }
    const rows = await readPeopleRanking()
    assert.deepEqual(calls, ['0', '100']); assert.equal(rows.length, 102)
    assert.equal(rows[100].server_id, 's-100'); assert.equal(rows[100].votes, 1); assert.equal(rows[101].votes, 0)
  } finally { globalThis.fetch = originalFetch }
})
test('failed later pages and repeated pages reject instead of displaying partial/false zero results', async () => {
  try {
    const first = Array.from({ length: 100 }, (_, i) => ({ server_id: `s-${i}`, votes: 100-i }))
    globalThis.fetch = async url => url.includes('offset=0') ? json(first) : new Response('{}', { status: 503 })
    await assert.rejects(readPeopleRanking())
    globalThis.fetch = async () => json(first)
    await assert.rejects(readPeopleRanking(), /страница/)
    globalThis.fetch = async () => json({ rows: [] })
    await assert.rejects(readPublicRanking('/support/ranking'), /ответ/)
  } finally { globalThis.fetch = originalFetch }
})

test('responsive profile panels share only concurrent reads, with fresh totals after completion', async () => {
  try {
    let calls = 0, release
    globalThis.fetch = async () => { calls++; if (calls === 1) return new Promise(resolve => { release = () => resolve(json([{ server_id: 'one', votes: 1 }])) }); return json([{ server_id: 'one', votes: 2 }]) }
    const first = readPeopleRanking(), second = readPeopleRanking()
    assert.equal(calls, 1)
    release()
    assert.deepEqual(await first, await second)
    assert.equal((await readPeopleRanking())[0].votes, 2, 'Never cache a pre-vote total after the request finishes')
    assert.equal(calls, 2)
    globalThis.fetch = async () => new Response('{}', { status: 503 })
    const failed = await Promise.allSettled([readPeopleRanking(), readPeopleRanking()])
    assert.ok(failed.every(row => row.status === 'rejected'))
    globalThis.fetch = async () => json([])
    assert.deepEqual(await readPeopleRanking(), [], 'Failed shared request cannot poison retries')
  } finally { globalThis.fetch = originalFetch }
})

test('post-vote refresh bypasses an older in-flight total and its cleanup cannot erase the fresh read', async () => {
  try {
    let calls=0, releaseOld, releaseFresh
    globalThis.fetch=async()=>{
      calls++
      if(calls===1)return new Promise(resolve=>{releaseOld=()=>resolve(json([{server_id:'one',votes:1}]))})
      return new Promise(resolve=>{releaseFresh=()=>resolve(json([{server_id:'one',votes:2}]))})
    }
    const old=readPeopleRanking(),fresh=readPeopleRanking(true)
    assert.equal(calls,2)
    releaseOld();assert.equal((await old)[0].votes,1)
    const joinedFresh=readPeopleRanking();assert.equal(calls,2,'Old cleanup must retain the current request')
    releaseFresh();assert.equal((await fresh)[0].votes,2);assert.equal((await joinedFresh)[0].votes,2)
  }finally{globalThis.fetch=originalFetch}
})
