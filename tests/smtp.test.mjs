import assert from 'node:assert/strict'
import net from 'node:net'
import test from 'node:test'
import { buildMessage, sendSmtp } from '../private-api/smtp.mjs'
import { codeMail, mailEnabled, sendMail } from '../worker/lib/mailer.ts'

/** A minimal fake SMTP server that records the conversation. */
function fakeServer({ rejectPassword = false } = {}) {
  const log = []
  let message = ''
  const server = net.createServer((socket) => {
    let mode = 'command'
    let buffer = ''
    const send = (line) => socket.write(line + '\r\n')
    send('220 fake ESMTP')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      for (;;) {
        if (mode === 'data') {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end < 0) return
          message = buffer.slice(0, end)
          buffer = buffer.slice(end + 5)
          mode = 'command'
          send('250 queued')
          continue
        }
        const eol = buffer.indexOf('\r\n')
        if (eol < 0) return
        const line = buffer.slice(0, eol)
        buffer = buffer.slice(eol + 2)
        log.push(line)
        if (line.startsWith('EHLO')) send('250-fake\r\n250 AUTH LOGIN')
        else if (line === 'AUTH LOGIN') send('334 VXNlcm5hbWU6')
        else if (log.at(-2) === 'AUTH LOGIN') send('334 UGFzc3dvcmQ6')
        else if (log.at(-3) === 'AUTH LOGIN') send(rejectPassword ? '535 bad credentials' : '235 ok')
        else if (line.startsWith('MAIL FROM')) send('250 ok')
        else if (line.startsWith('RCPT TO')) send('250 ok')
        else if (line === 'DATA') { mode = 'data'; send('354 go') }
        else if (line === 'QUIT') send('221 bye')
      }
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, log, message: () => message, port: server.address().port })))
}

const env = (port) => ({
  ENVIRONMENT: 'development', MAIL_DRIVER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_TLS: 'off',
  SMTP_USER: 'gamescout@yandex.ru', SMTP_PASSWORD: 'app-password-1', MAIL_FROM: 'GameScout <gamescout@yandex.ru>', SMTP_SEND: sendSmtp,
})

test('a code mail goes out over SMTP with UTF-8 subject and both bodies', async () => {
  const fake = await fakeServer()
  try {
    const mail = codeMail('player@example.com', 'REGISTER', '482913', 15)
    assert.equal(mailEnabled(env(fake.port)), true)
    await sendMail(env(fake.port), mail)
    assert.ok(fake.log.includes('MAIL FROM:<gamescout@yandex.ru>'))
    assert.ok(fake.log.includes('RCPT TO:<player@example.com>'))
    assert.ok(fake.log.includes(Buffer.from('gamescout@yandex.ru').toString('base64')))
    const body = fake.message()
    assert.match(body, /^From: GameScout <gamescout@yandex\.ru>/m)
    assert.match(body, /^Subject: =\?UTF-8\?B\?/m)
    assert.match(body, /multipart\/alternative/)
    const decoded = [...body.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)].map((m) => Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'))
    assert.ok(decoded.some((part) => part.includes('482913') && part.includes('Чтобы закончить регистрацию')))
  } finally {
    fake.server.close()
  }
})

test('a rejected password fails with the step and code only, never the credentials', async () => {
  const fake = await fakeServer({ rejectPassword: true })
  const errors = []
  const original = console.error
  console.error = (...args) => errors.push(args.join(' '))
  try {
    await assert.rejects(sendMail(env(fake.port), codeMail('a@example.com', 'LOGIN', '111111', 15)), /mail_send_failed/)
    assert.ok(errors.some((line) => line.includes('smtp_password_535')))
    assert.ok(!errors.join('\n').includes('app-password-1'))
  } finally {
    console.error = original
    fake.server.close()
  }
})

test('smtp is off without a sender, credentials or From; TLS-off is ignored outside development', async () => {
  assert.equal(mailEnabled({ ...env(25), SMTP_PASSWORD: undefined }), false)
  assert.equal(mailEnabled({ ...env(25), MAIL_FROM: undefined }), false)
  assert.equal(mailEnabled({ ...env(25), SMTP_SEND: undefined }), false)
  assert.equal(mailEnabled({ MAIL_DRIVER: 'disabled' }), false)
  // in production the socket would be TLS to a plain server: it must fail, not fall back to plaintext
  const fake = await fakeServer()
  try {
    await assert.rejects(sendSmtp({ ...env(fake.port), ENVIRONMENT: 'production' }, { to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' }))
    assert.equal(fake.log.length, 0, 'no SMTP command reached the plain server')
  } finally {
    fake.server.close()
  }
})

test('message headers cannot be injected through the recipient or the subject', () => {
  assert.throws(() => buildMessage({ from: 'GameScout <gs@yandex.ru>', to: 'a@example.com\r\nBcc: x@example.com', subject: 's', text: 't', html: 'h' }), /smtp_invalid_to/)
  const { data } = buildMessage({ from: 'GameScout <gs@yandex.ru>', to: 'a@example.com', subject: 'Тема\r\nBcc: x@example.com', text: '.hidden', html: 'h' })
  assert.ok(!/^Bcc:/m.test(data))
})

test('a link letter carries the link in the button and in the text, in HTML-safe form', async () => {
  const { linkMail } = await import('../worker/lib/mailer.ts')
  const mail = linkMail('player@example.com', 'EMAIL', 'https://gamescout.online/account#token=abc_DEF-123&purpose=email')
  assert.match(mail.subject, /Подтвердите почту/)
  assert.ok(mail.html.includes('href="https://gamescout.online/account#token=abc_DEF-123&amp;purpose=email"'))
  assert.ok(mail.text.includes('https://gamescout.online/account#token=abc_DEF-123&purpose=email'))
  assert.ok(!mail.html.includes('текстовой версии'))
  assert.ok(linkMail('a@example.com', 'X', 'https://x/"><script>').html.includes('&quot;&gt;&lt;script&gt;'))
})
