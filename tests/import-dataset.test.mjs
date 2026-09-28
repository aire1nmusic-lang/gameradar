/**
 * The import dataset contract: only public facts get in, and the generated
 * SQL is keyed so a repeat import can never create a second card.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { DatasetError, cardText, importSql, loadDataset, serverId, validateRecord } from '../scripts/import/dataset.mjs'

const base = {
  key: 'mc:play.example-network.net',
  game: 'minecraft',
  name: 'Example Network',
  website: 'https://example-network.net/',
  chronicle: 'survival',
  version: '1.8–1.21',
  modes: ['Survival'],
  languages: ['English'],
  endpoint: { method: 'GAME_PROTOCOL', host: 'play.example-network.net', port: null },
  source: { name: 'Official website', url: 'https://example-network.net/' },
  refs: [
    { name: 'Official website', url: 'https://example-network.net/' },
    { name: 'Some catalogue', url: 'https://catalogue.example-list.org/server/1' },
  ],
  checkedAt: '2026-09-22',
  confidence: 'confirmed',
}

test('the committed dataset is valid', () => {
  const records = loadDataset()
  assert.ok(records.length > 0)
})

test('advertising copy and artwork have no field to live in', () => {
  for (const field of ['description', 'summary', 'logo', 'banner', 'image', 'screenshots', 'motd']) {
    assert.throws(() => validateRecord({ ...base, [field]: 'x' }), DatasetError, field)
  }
})

test('a record confirmed by a single site is not "confirmed"', () => {
  assert.throws(() => validateRecord({ ...base, refs: [base.refs[0]] }), /two independent sources/)
  assert.equal(validateRecord({ ...base, refs: [base.refs[0]], confidence: 'likely' }).confidence, 'likely')
})

test('FiveM endpoints must be the server itself, never the Cfx.re master list or relay', () => {
  const gta = { ...base, key: 'gta:example-city', game: 'gtarp', chronicle: 'fivem', version: 'FiveM', modes: [] }
  for (const url of ['https://servers-frontend.fivem.net/', 'https://example-abc.users.cfx.re/']) {
    assert.throws(() => validateRecord({ ...gta, endpoint: { method: 'SERVER_API', url } }), /Cfx\.re/)
  }
  const ok = validateRecord({ ...gta, endpoint: { method: 'SERVER_API', url: 'http://51.91.1.2:30120/', expectName: 'Example City' } })
  assert.equal(ok.endpoint.url, 'http://51.91.1.2:30120/')
})

test('private addresses and non-https websites are refused', () => {
  assert.throws(() => validateRecord({ ...base, endpoint: { method: 'GAME_PROTOCOL', host: '192.168.1.10' } }), /public/)
  assert.throws(() => validateRecord({ ...base, website: 'http://example-network.net/' }), /https/)
  assert.throws(() => validateRecord({ ...base, endpoint: { method: 'LOGIN_SERVER', host: 'play.example-network.net' } }), /not supported/)
})

test('ids derive from the record key, so a repeat import upserts the same row', () => {
  const record = validateRecord(base)
  const first = importSql([record], { at: '2026-09-22T00:00:00.000Z' })
  const again = importSql([record], { existing: [{ id: serverId(record), slug: first.plan[0].slug }], at: '2026-09-23T00:00:00.000Z' })
  assert.equal(first.plan[0].id, again.plan[0].id)
  assert.equal(first.plan[0].slug, again.plan[0].slug)
  assert.equal(again.plan[0].action, 'update')
  assert.match(first.sql, /ON CONFLICT\(id\) DO UPDATE/)
  assert.match(first.sql, /WHERE servers\.owner_id IS NULL/)
})

test('a taken slug gets a suffix instead of colliding with another card', () => {
  const record = validateRecord(base)
  const { plan } = importSql([record], { existing: [{ id: 'srv_owner', slug: 'example-network' }] })
  assert.equal(plan[0].slug, 'example-network-minecraft')
})

test('card text is written by GameScout from facts only', () => {
  const { sql } = importSql([validateRecord(base)])
  assert.match(sql, /Карточка собрана GameScout по открытым данным/)
  assert.match(sql, /статус LIVE, а не VERIFIED/)
  const gta = { ...base, key: 'gta:example-city', game: 'gtarp', chronicle: 'fivem', version: 'FiveM', modes: [] }
  const gtaWithEndpoint = cardText(validateRecord({ ...gta, endpoint: { method: 'SERVER_API', url: 'http://51.91.1.2:30120/', expectName: 'Example City' } }))
  assert.match(gtaWithEndpoint.description, /Текущий онлайн появится только после успешного измерения/)
  assert.doesNotMatch(gtaWithEndpoint.description, /считывает напрямую/)
})
