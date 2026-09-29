/**
 * Plain SMTP sender for the private API (Node only): a mailbox at Yandex, Mail.ru,
 * Gmail or any provider, used with an app password. No dependencies.
 *
 *   MAIL_DRIVER=smtp
 *   SMTP_HOST=smtp.yandex.ru     SMTP_PORT=465 (implicit TLS)
 *   SMTP_USER=gamescout@yandex.ru
 *   SMTP_PASSWORD=<app password, never the account password>
 *   MAIL_FROM=GameScout <gamescout@yandex.ru>
 *
 * The provider requires the From address to be the mailbox itself. TLS is always
 * verified. `SMTP_TLS=off` exists for tests against a local fake server only and
 * is ignored in production.
 */
import net from 'node:net'
import tls from 'node:tls'
import { randomBytes } from 'node:crypto'

const CRLF = '\r\n'
const wrap = (text) => text.replace(/(.{76})/g, `$1${CRLF}`)
const b64 = (text) => wrap(Buffer.from(text, 'utf8').toString('base64'))
const encodedWord = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`)

function parseFrom(from) {
  const match = String(from).match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  const address = (match ? match[2] : String(from)).trim()
  if (!/^[^\s<>@"]+@[^\s<>@"]+$/.test(address)) throw new Error('smtp_invalid_from')
  return { name: match?.[1]?.replace(/["\r\n]/g, ''), address }
}

/** Builds the RFC 5322 message: multipart/alternative, UTF-8, base64 bodies. */
export function buildMessage({ from, to, subject, text, html }, now = new Date()) {
  const sender = parseFrom(from)
  if (!/^[^\s<>@"]+@[^\s<>@"]+$/.test(to)) throw new Error('smtp_invalid_to')
  const boundary = `gs_${randomBytes(12).toString('hex')}`
  const domain = sender.address.split('@')[1]
  const headers = [
    `From: ${sender.name ? `${encodedWord(sender.name)} ` : ''}<${sender.address}>`,
    `To: <${to}>`,
    `Subject: ${encodedWord(String(subject).replace(/[\r\n]+/g, ' '))}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomBytes(12).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  const part = (type, body) => `--${boundary}${CRLF}Content-Type: ${type}; charset=UTF-8${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}${b64(body)}${CRLF}`
  return { sender: sender.address, data: `${headers.join(CRLF)}${CRLF}${CRLF}${part('text/plain', text)}${part('text/html', html)}--${boundary}--${CRLF}` }
}

/** Reads SMTP replies (multi-line aware) from a socket, one per call. */
function reader(socket) {
  let buffer = ''
  const waiting = []
  const ready = []
  const check = () => {
    for (;;) {
      const lines = buffer.split(CRLF)
      let end = -1
      for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { end = i; break }
      if (end < 0) return
      const reply = lines.slice(0, end + 1)
      buffer = lines.slice(end + 1).join(CRLF)
      const item = { code: Number(reply[end].slice(0, 3)), text: reply.join('\n') }
      const next = waiting.shift()
      next ? next.resolve(item) : ready.push(item)
    }
  }
  socket.on('data', (chunk) => { buffer += chunk.toString('utf8'); check() })
  socket.on('error', (error) => { for (const w of waiting.splice(0)) w.reject(error) })
  socket.on('close', () => { for (const w of waiting.splice(0)) w.reject(new Error('smtp_closed')) })
  return () => new Promise((resolve, reject) => {
    const item = ready.shift()
    if (item) return resolve(item)
    waiting.push({ resolve, reject })
  })
}

/** Sends one message. Throws with the SMTP reply code only (never the credentials). */
export async function sendSmtp(env, mail) {
  const host = env.SMTP_HOST
  const port = Number(env.SMTP_PORT || 465)
  if (!host || !env.SMTP_USER || !env.SMTP_PASSWORD) throw new Error('smtp_not_configured')
  const plain = env.SMTP_TLS === 'off' && env.ENVIRONMENT === 'development'
  const { sender, data } = buildMessage({ ...mail, from: env.MAIL_FROM })

  const socket = plain
    ? net.connect({ host, port })
    : tls.connect({ host, port, servername: host, rejectUnauthorized: true, minVersion: 'TLSv1.2' })
  socket.setTimeout(20_000, () => socket.destroy(new Error('smtp_timeout')))
  const read = reader(socket)
  const say = (line) => socket.write(line + CRLF)
  const expect = async (codes, step) => {
    const reply = await read()
    if (!codes.includes(reply.code)) throw new Error(`smtp_${step}_${reply.code}`)
    return reply
  }
  try {
    await expect([220], 'greeting')
    say('EHLO gamescout.online')
    await expect([250], 'ehlo')
    say('AUTH LOGIN')
    await expect([334], 'auth')
    say(Buffer.from(env.SMTP_USER).toString('base64'))
    await expect([334], 'user')
    say(Buffer.from(env.SMTP_PASSWORD).toString('base64'))
    await expect([235], 'password')
    say(`MAIL FROM:<${sender}>`)
    await expect([250], 'from')
    say(`RCPT TO:<${mail.to}>`)
    await expect([250, 251], 'rcpt')
    say('DATA')
    await expect([354], 'data')
    // dot-stuffing: a line that starts with "." would end the message early
    socket.write(data.replace(/^\./gm, '..') + `.${CRLF}`)
    await expect([250], 'send')
    say('QUIT')
  } finally {
    socket.end()
  }
}
