// One-command go-live of the free accounts service (owner runs it; sign-up stays CLOSED):
//   node scripts/accounts-go-live.mjs
// 1. creates PASSWORD_PEPPER and ACCOUNTS_RATE_KEY once, keeps them in the owner's private folder
//    (Documents/GameScout Secrets/accounts-20261028 — never in Git), and stores them as Worker secrets;
// 2. applies the pending D1 migration 0012_free_accounts.sql (new acc_* tables only);
// 3. deploys the Worker; 4. checks the live site. Secret values are never printed.
// Rollback: remove ACCOUNTS_FREE from wrangler.toml and run `npx wrangler deploy` again.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')
const run = (args, input) => {
  const result = spawnSync(process.execPath, [wrangler, ...args], { input, encoding: 'utf8', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } })
  if (result.status !== 0) {
    console.error(`FAILED: wrangler ${args.join(' ')}\n${(result.stderr || result.stdout || '').slice(-1500)}`)
    process.exit(1)
  }
  return result.stdout
}
const step = text => console.log(`\n== ${text}`)

step('1/4 Cloudflare login')
console.log(run(['whoami']).match(/associated with the email ([^\s.]+@[^\s]+)/)?.[0] ?? 'logged in')

step('2/4 Worker secrets')
const folder = join(homedir(), 'Documents', 'GameScout Secrets', 'accounts-20261028')
mkdirSync(folder, { recursive: true })
for (const name of ['PASSWORD_PEPPER', 'ACCOUNTS_RATE_KEY']) {
  const file = join(folder, `${name}.txt`)
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 })
  run(['secret', 'put', name], readFileSync(file, 'utf8').trim())
  console.log(`${name}: stored (copy kept in ${folder})`)
}
console.log('KEEP THIS FOLDER: without PASSWORD_PEPPER no password can ever be checked again.')

step('3/4 D1 migration (new acc_* tables only)')
console.log(run(['d1', 'migrations', 'apply', 'gamescout', '--remote']).split('\n').filter(line => /0012|No migrations|✅|applied/i.test(line)).join('\n') || 'applied')

step('4/4 Deploy Worker')
console.log(run(['deploy']).split('\n').filter(line => /Uploaded|Deployed|Version ID|https:\/\//.test(line)).join('\n'))

step('Live check')
const base = 'https://gamescout.online/api/v1'
let ok = true
for (const [path, check] of [['/health', body => body.status === 'ok'], ['/games', body => Array.isArray(body)],
  ['/auth/me', body => body.privateCore === true && body.registrationOpen === false && 'user' in body]]) {
  const response = await fetch(base + path, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) })
  const body = await response.json().catch(() => ({}))
  const good = response.ok && check(body)
  ok &&= good
  console.log(`${good ? 'OK  ' : 'FAIL'} ${path} HTTP ${response.status}`)
}
console.log(ok ? '\nDONE: accounts service is live, sign-up is closed until mail and Google/Discord keys are added.'
  : '\nCHECK FAILED: send this output to Claude; rollback = remove ACCOUNTS_FREE from wrangler.toml and run npx wrangler deploy.')
process.exit(ok ? 0 : 1)
