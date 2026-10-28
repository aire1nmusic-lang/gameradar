// Owner runs:  node scripts/accounts-keys.mjs
// Asks for the sign-in keys (input is hidden; press Enter to skip a key you do not have), stores them as
// Worker secrets, deploys the Worker from this checkout and checks which sign-in buttons the live site offers.
// Keys never reach Git, the console log or Claude.
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import readline from 'node:readline'

const KEYS = [
  ['YANDEX_CLIENT_ID', 'Яндекс ID — ClientID'], ['YANDEX_CLIENT_SECRET', 'Яндекс ID — Client secret'],
  ['GOOGLE_CLIENT_ID', 'Google — Client ID'], ['GOOGLE_CLIENT_SECRET', 'Google — Client secret'],
  ['DISCORD_CLIENT_ID', 'Discord — Client ID'], ['DISCORD_CLIENT_SECRET', 'Discord — Client secret'],
]
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')
const run = (args, input) => {
  const result = spawnSync(process.execPath, [wrangler, ...args], { input, encoding: 'utf8', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } })
  if (result.status !== 0) { console.error(`FAILED: wrangler ${args.join(' ')}\n${(result.stderr || result.stdout || '').slice(-1500)}`); process.exit(1) }
  return result.stdout
}

function askHidden(question) {
  return new Promise(done => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(text); else if (!/\r|\n/.test(text)) process.stdout.write('*') }
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); done(answer.trim()) })
  })
}

console.log('Вставьте ключи (они не показываются на экране). Нет ключа — просто нажмите Enter.\n')
let stored = 0
for (const [name, label] of KEYS) {
  const value = await askHidden(`${label}: `)
  if (!value) continue
  if (value.length > 512 || /\s/.test(value)) { console.error(`${label}: похоже на ошибку при вставке, пропускаю`); continue }
  run(['secret', 'put', name], value)
  stored++
  console.log(`  ${name}: сохранён`)
}
console.log(`\nСохранено ключей: ${stored}. Выкладываю Worker…`)
console.log(run(['deploy']).split('\n').filter(line => /Deployed|Version ID/.test(line)).join('\n'))

const response = await fetch('https://gamescout.online/api/v1/auth/me', { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) })
const me = await response.json().catch(() => ({}))
console.log(`\nСайт: HTTP ${response.status}; кнопки входа: ${(me.providers ?? []).join(', ') || 'нет'}; регистрация ${me.registrationOpen ? 'открыта' : 'закрыта'}`)
console.log(response.ok && me.privateCore ? 'DONE' : 'CHECK FAILED — пришлите этот вывод Claude')
