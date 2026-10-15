import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicPeopleRanking } from '../worker/lib/people-ranking.ts'
const params = query => new URLSearchParams(query)
const json = rows => new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json' } })
test('vote totals come only from the fixed Russian endpoint and expose an explicit public DTO', async () => {
  const rows = await publicPeopleRanking(params('offset=100&limit=2'), async (url, init) => {
    assert.equal(url, 'https://priv.gamescout.online/api/v1/people-rating?limit=2&offset=100')
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error')
    assert.deepEqual(init.headers, { Accept: 'application/json' })
    assert.equal(init.method, 'GET'); assert.ok(init.signal)
    return json([{ server_id: 'mc-1', votes: 3, email: 'private@example.invalid', user_id: 'never-public' }, { server_id: 'l2-2', votes: 0 }])
  })
  assert.deepEqual(rows, [{ server_id: 'mc-1', votes: 3 }, { server_id: 'l2-2', votes: 0 }])
})
test('invalid pages and arbitrary upstream/identity parameters never initiate a request', async () => {
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'offset=-1', 'offset=1000001', 'limit=NaN', 'limit=1&limit=2', 'url=https://evil.invalid', 'cookie=secret'])
    await assert.rejects(publicPeopleRanking(params(query), () => assert.fail('must not fetch')), { status: 400 })
})
test('outage, HTML fallback, duplicate IDs and malformed totals fail visibly without fabricating zeros', async () => {
  for (const response of [new Response('down', { status: 503 }), new Response('<html/>'), json({}), json([{ server_id: 'a', votes: -1 }]), json([{ server_id: 'a', votes: '1' }]), json([{ server_id: 'a', votes: 1 }, { server_id: 'a', votes: 2 }]), json([{ server_id: 'a', votes: 1 }, { server_id: 'b', votes: 2 }]), new Response(' '.repeat(65537), { headers: { 'content-type': 'application/json' } })])
    await assert.rejects(publicPeopleRanking(params('limit=1'), async () => response), { status: 503, code: 'ranking_unavailable' })
  await assert.rejects(publicPeopleRanking(params(''), async () => { throw new Error('timeout') }), { code: 'ranking_unavailable' })
  assert.deepEqual(await publicPeopleRanking(params(''), async () => json([])), [])
})
