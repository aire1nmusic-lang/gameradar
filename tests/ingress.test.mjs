import test from 'node:test'
import assert from 'node:assert/strict'
import {canonicalClientIp,yandexClientIp,vmProxyClientIp} from '../private-api/ingress.mjs'
test('equivalent IPv6 and IPv4-mapped addresses share a risk identity',()=>{
  assert.equal(canonicalClientIp('2001:0DB8:0000:0000:0000:0000:0000:0001'),'2001:db8::1')
  for(const value of ['::ffff:192.0.2.7','::FFFF:c000:207','192.0.2.7'])assert.equal(canonicalClientIp(value),'192.0.2.7')
  for(const value of [undefined,[],{},'example.com','192.0.2.7, 198.51.100.1',''])assert.equal(canonicalClientIp(value),'unknown')
})
test('normalization never makes an unauthenticated proxy header trustworthy',()=>{
  const secret='s'.repeat(64),headers={'x-gs-client-ip':'203.0.113.1, 2001:0DB8:0:0:0:0:0:1','x-gs-proxy-secret':secret}
  assert.equal(vmProxyClientIp(headers,secret),'2001:db8::1')
  assert.equal(vmProxyClientIp({...headers,'x-gs-proxy-secret':'forged'},secret),'unknown')
  assert.equal(yandexClientIp({'x-forwarded-for':'spoofed, ::ffff:192.0.2.7'}),'192.0.2.7')
})
