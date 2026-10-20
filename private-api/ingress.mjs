import { isIP } from 'node:net'
import { timingSafeEqual } from 'node:crypto'

/** One risk identity for equivalent IPv6 spellings and IPv4-mapped sockets. */
export function canonicalClientIp(value) {
  if(typeof value!=='string')return 'unknown'
  const kind=isIP(value)
  if(kind===4)return value
  if(kind!==6)return 'unknown'
  try{
    const ip=new URL(`http://[${value}]/`).hostname.slice(1,-1)
    const mapped=ip.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/)
    if(mapped){const high=parseInt(mapped[1],16),low=parseInt(mapped[2],16);return [high>>>8,high&255,low>>>8,low&255].join('.')}
    return ip
  }catch{return 'unknown'}
}

/** Yandex appends the caller IP to X-Forwarded-For; never trust earlier entries. */
export function yandexClientIp(headers,remoteAddress) {
  const raw=headers['x-forwarded-for']
  const value=Array.isArray(raw)?raw.at(-1):raw
  const last=typeof value==='string'?value.split(',').at(-1)?.trim():''
  if(last&&isIP(last))return canonicalClientIp(last)
  // A missing/invalid ingress signal must not be mistaken for a unique IP.
  return 'unknown'
}

export function localClientIp(remoteAddress) {
  return canonicalClientIp(remoteAddress)
}

/** Only the VM's TLS proxy may set these headers; never accept a browser-supplied IP. */
export function vmProxyClientIp(headers,secret) {
  const supplied=headers['x-gs-proxy-secret']
  const list=headers['x-gs-client-ip']
  // Behind the API Gateway the proxy passes X-Forwarded-For through; the last entry is the one the gateway appended.
  const ip=typeof list==='string'?list.split(',').at(-1).trim():list
  if(typeof supplied!=='string'||typeof ip!=='string'||!isIP(ip)||typeof secret!=='string')return 'unknown'
  const received=Buffer.from(supplied),expected=Buffer.from(secret)
  return received.length===expected.length&&timingSafeEqual(received,expected)?canonicalClientIp(ip):'unknown'
}
