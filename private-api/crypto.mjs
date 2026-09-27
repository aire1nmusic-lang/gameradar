import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(scryptCallback)
export const token = () => randomBytes(32).toString('base64url')
export const digest = value => createHash('sha256').update(value).digest('hex')
export const keyed = (key, value) => createHmac('sha256', key).update(value).digest('hex')
export function equal(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
export function passwordValid(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url')
  const result = await scrypt(password, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 })
  return `scrypt$131072$8$1$${salt}$${result.toString('base64url')}`
}
export async function verifyPassword(password, encoded) {
  const parts = (encoded ?? '').split('$')
  if (parts.length !== 6 || parts.slice(0,4).join('$') !== 'scrypt$131072$8$1') return false
  const result = await scrypt(password, parts[4], 32, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 })
  return equal(result.toString('base64url'), parts[5])
}
export function seal(key, payload) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  const bytes = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), bytes].map(x => x.toString('base64url')).join('.')
}
export function unseal(key, data) {
  const [iv, tag, bytes] = data.split('.').map(x => Buffer.from(x, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  decipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([decipher.update(bytes), decipher.final()]).toString('utf8'))
}
