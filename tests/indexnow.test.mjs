import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { payload, urlsFromSitemap } from '../scripts/indexnow.mjs'

test('IndexNow key file is a plain 32-hex key served from the site root', () => {
  assert.match(readFileSync('public/indexnow.txt', 'utf8'), /^[0-9a-f]{32}$/)
})

test('only gamescout.online URLs from the sitemap are submitted, with the key location', () => {
  const xml = '<url><loc>https://gamescout.online/</loc></url><url><loc>https://gamescout.online/catalog?game=a&amp;b=1</loc></url><url><loc>https://evil.example/x</loc></url>'
  const urls = urlsFromSitemap(xml)
  assert.deepEqual(urls, ['https://gamescout.online/', 'https://gamescout.online/catalog?game=a&b=1'])
  const body = payload(urls)
  assert.equal(body.host, 'gamescout.online')
  assert.equal(body.keyLocation, 'https://gamescout.online/indexnow.txt')
  assert.equal(body.key, readFileSync('public/indexnow.txt', 'utf8').trim())
})
