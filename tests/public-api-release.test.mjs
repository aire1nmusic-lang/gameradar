import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyPublicRanking } from '../scripts/publish-public-api.mjs'
const fixture = (mode = '') => async url => {
  if (url.endsWith('/auth/me')) return new Response(JSON.stringify({ error: { code: 'private_api_required' } }), { status: mode === 'private-open' ? 200 : 503 })
  const votes = url.includes('/people-rating')
  return new Response(JSON.stringify(votes ? [{ server_id: 'a', votes: 3, ...(mode === 'extra-field' ? { email: 'hidden' } : {}) }] : { ok: true }), { status: votes && mode === 'outage' ? 503 : 200, headers: { 'content-type': 'application/json' } })
}
test('release requires real public vote DTO and keeps D1 private routes closed', async () => {
  await verifyPublicRanking(fixture())
  for (const mode of ['private-open', 'extra-field', 'outage']) await assert.rejects(verifyPublicRanking(fixture(mode)))
})
