/**
 * SMTP from a Worker over Cloudflare TCP sockets (free plan; port 25 is blocked, 465/587 are not).
 * Used with MAIL_DRIVER=smtp, e.g. Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465 (implicit TLS),
 * SMTP_USER=<the Gmail address>, SMTP_PASSWORD=<an app password>, MAIL_FROM="GameScout <the same address>".
 * Errors carry the SMTP step and reply code only — never credentials or the message.
 */
import { buildMessage } from '../../private-api/smtp-message.mjs'
import type { Env } from './core.ts'

const CRLF = '\r\n'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export async function sendSmtpSocket(env: Env, mail: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const host = env.SMTP_HOST, port = Number(env.SMTP_PORT || 465)
  if (!host || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM) throw new Error('smtp_not_configured')
  // Plain TCP only for a local fake server in development; production always uses TLS.
  const plain = env.SMTP_TLS === 'off' && env.ENVIRONMENT === 'development'
  const { sender, data } = buildMessage({ ...mail, from: env.MAIL_FROM }) as { sender: string; data: string }
  // Loaded on use, so Node tests of the Worker modules do not need the Workers runtime.
  const { connect } = await import('cloudflare:sockets')
  const socket = connect({ hostname: host, port }, { secureTransport: plain ? 'off' : 'on', allowHalfOpen: false })
  const writer = socket.writable.getWriter(), reader = socket.readable.getReader()
  let buffer = ''
  const read = async (step: string, codes: number[]) => {
    const deadline = Date.now() + 20_000
    for (;;) {
      const lines = buffer.split(CRLF)
      const end = lines.findIndex((line, i) => i < lines.length - 1 && /^\d{3} /.test(line))
      if (end >= 0) {
        buffer = lines.slice(end + 1).join(CRLF)
        const code = Number(lines[end].slice(0, 3))
        if (!codes.includes(code)) throw new Error(`smtp_${step}_${code}`)
        return
      }
      if (Date.now() > deadline) throw new Error(`smtp_${step}_timeout`)
      const { value, done } = await reader.read()
      if (done) throw new Error(`smtp_${step}_closed`)
      buffer += decoder.decode(value, { stream: true })
    }
  }
  const say = (line: string) => writer.write(encoder.encode(line + CRLF))
  const b64 = (text: string) => btoa(String.fromCharCode(...encoder.encode(text)))
  try {
    await read('greeting', [220])
    await say('EHLO gamescout.online'); await read('ehlo', [250])
    await say('AUTH LOGIN'); await read('auth', [334])
    await say(b64(env.SMTP_USER)); await read('user', [334])
    await say(b64(env.SMTP_PASSWORD)); await read('password', [235])
    await say(`MAIL FROM:<${sender}>`); await read('from', [250])
    await say(`RCPT TO:<${mail.to}>`); await read('rcpt', [250, 251])
    await say('DATA'); await read('data', [354])
    // dot-stuffing: a line that starts with "." would end the message early
    await writer.write(encoder.encode(data.replace(/^\./gm, '..') + `.${CRLF}`)); await read('send', [250])
    await say('QUIT')
  } finally {
    try { await socket.close() } catch { /* already closed */ }
  }
}
