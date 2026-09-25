/**
 * Password hashing: PBKDF2-SHA256 with a random salt and a server-side pepper
 * (PASSWORD_PEPPER, a Worker secret that never reaches the database), so a
 * leaked database alone cannot be brute-forced.
 *
 * The iteration count is stored in each hash ("pbkdf2$<iter>$<salt>$<hash>"),
 * so it can be raised later without breaking old passwords. It is modest
 * because the free Workers plan allows ~10 ms of CPU per request; the pepper
 * carries the weight that iterations alone would.
 */
const ITERATIONS = 15_000
const encoder = new TextEncoder()

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), c => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number, pepper: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(`${password}\u0000${pepper}`), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

export async function hashPassword(password: string, pepper = ''): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS, pepper)
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`
}

export async function verifyPassword(password: string, stored: string | null | undefined, pepper = ''): Promise<boolean> {
  if (!stored) return false
  const [scheme, iter, salt, hash] = stored.split('$')
  const iterations = Number(iter)
  if (scheme !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1000 || !salt || !hash) return false
  const expected = unb64(hash)
  const actual = await derive(password, unb64(salt), iterations, pepper)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

/** Rules shown to the person in the form: long enough, not absurdly long. */
export function passwordProblem(password: unknown): string | undefined {
  if (typeof password !== 'string') return 'Введите пароль'
  if (password.length < 8) return 'Пароль — не короче 8 символов'
  if (password.length > 128) return 'Пароль — не длиннее 128 символов'
  if (/^\d+$/.test(password)) return 'Пароль не может состоять только из цифр'
  return undefined
}
