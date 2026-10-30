/** RFC 5322 message builder shared by the Node SMTP sender and the Worker socket sender (no network imports). */
import { randomBytes } from 'node:crypto'

export const CRLF = '\r\n'
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
