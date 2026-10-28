import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** The few primitives the accounts app needs; available both in Node and in Workers (nodejs_compat). */
export const token = () => randomBytes(32).toString('base64url')
export const digest = value => createHash('sha256').update(value).digest('hex')
export const keyed = (key, value) => createHmac('sha256', key).update(value).digest('hex')
export const passwordValid = password => typeof password === 'string' && password.length >= 12 && password.length <= 128
export function equal(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}
