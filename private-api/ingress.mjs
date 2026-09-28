import { isIP } from 'node:net'

/** Yandex appends the caller IP to X-Forwarded-For; never trust earlier entries. */
export function yandexClientIp(headers,remoteAddress) {
  const raw=headers['x-forwarded-for']
  const value=Array.isArray(raw)?raw.at(-1):raw
  const last=typeof value==='string'?value.split(',').at(-1)?.trim():''
  if(last&&isIP(last))return last
  // A missing/invalid ingress signal must not be mistaken for a unique IP.
  return 'unknown'
}

export function localClientIp(remoteAddress) {
  return remoteAddress&&isIP(remoteAddress)?remoteAddress:'unknown'
}
