import { isIP } from 'node:net'
import { timingSafeEqual } from 'node:crypto'

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

/** Only the VM's TLS proxy may set these headers; never accept a browser-supplied IP. */
export function vmProxyClientIp(headers,secret) {
  const supplied=headers['x-gs-proxy-secret']
  const ip=headers['x-gs-client-ip']
  if(typeof supplied!=='string'||typeof ip!=='string'||!isIP(ip)||typeof secret!=='string')return 'unknown'
  const received=Buffer.from(supplied),expected=Buffer.from(secret)
  return received.length===expected.length&&timingSafeEqual(received,expected)?ip:'unknown'
}
