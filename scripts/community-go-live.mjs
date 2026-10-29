// One-command go-live of votes, owner Claims, owner edits and admin moderation on Cloudflare (owner runs it):
//   node scripts/community-go-live.mjs
// 1. checks the Cloudflare login; 2. shows and applies the pending D1 migrations (0013_free_community.sql: new fc_* tables,
//    two added columns, nothing changed or removed) — BEFORE the deploy, because catalog reads join fc_owners;
// 3. deploys the Worker from this checkout; 4. checks the live site. No secrets are needed or printed.
// Rollback: set ACCOUNTS_COMMUNITY="false" in wrangler.toml and run `npx wrangler deploy`
// (the new tables stay; they are unused while the flag is off).
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')
const run = args => {
  const result = spawnSync(process.execPath, [wrangler, ...args], { encoding: 'utf8', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } })
  if (result.status !== 0) {
    console.error(`FAILED: wrangler ${args.join(' ')}\n${(result.stderr || result.stdout || '').slice(-1500)}`)
    process.exit(1)
  }
  return result.stdout
}
const step = text => console.log(`\n== ${text}`)

step('1/4 Cloudflare login')
console.log(run(['whoami']).match(/associated with the email ([^\s.]+@[^\s]+)/)?.[0] ?? 'logged in')

step('2/4 D1 migrations (only new tables and columns)')
const pending = run(['d1', 'migrations', 'list', 'gamescout', '--remote'])
const names = [...pending.matchAll(/(\d{4}_[\w-]+\.sql)/g)].map(match => match[1])
console.log(names.length ? `pending: ${names.join(', ')}` : 'nothing pending')
if (names.some(name => name !== '0013_free_community.sql')) {
  console.error('STOP: an unexpected migration is pending; send this output to Claude before applying anything.')
  process.exit(1)
}
if (names.length) console.log(run(['d1', 'migrations', 'apply', 'gamescout', '--remote']).split('\n').filter(line => /0013|✅|applied/i.test(line)).join('\n') || 'applied')

step('3/4 Deploy Worker')
console.log(run(['deploy']).split('\n').filter(line => /Deployed|Version ID/.test(line)).join('\n'))

step('4/4 Live check')
const base = 'https://gamescout.online/api/v1'
let ok = true
for (const [path, check] of [['/games', body => Array.isArray(body) && body.length > 0],
  ['/people-rating?limit=3', body => Array.isArray(body) && body.every(row => typeof row.server_id === 'string' && Number.isInteger(row.votes))],
  ['/auth/me', body => body.privateCore === true && 'user' in body],
  ['/servers?limit=1', body => Array.isArray(body.items)]]) {
  const response = await fetch(base + path, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) })
  const body = await response.json().catch(() => ({}))
  const good = response.ok && check(body)
  ok &&= good
  console.log(`${good ? 'OK  ' : 'FAIL'} ${path} HTTP ${response.status}`)
}
console.log(ok ? '\nDONE: votes, Claims and moderation are live. Sign out and sign in with Google once to get the admin tabs.'
  : '\nCHECK FAILED: send this output to Claude; rollback = ACCOUNTS_COMMUNITY="false" in wrangler.toml, then npx wrangler deploy.')
process.exit(ok ? 0 : 1)
