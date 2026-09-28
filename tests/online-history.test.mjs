import test from 'node:test'
import assert from 'node:assert/strict'
import { observedHistory } from '../src/lib/onlineHistory.ts'
import { sampleDto } from '../worker/lib/dto.ts'

test('history plots actual observation times and never invents a zero',()=>{
  const now=Date.parse('2026-09-28T12:00:00Z')
  const samples=[
    {serverId:'mc',at:'2026-09-20T01:00:00Z',players:99,status:'LIVE'},
    {serverId:'mc',at:'2026-09-28T01:00:00Z',players:12,status:'LIVE',sourceName:'Minecraft SLP'},
    {serverId:'mc',at:'2026-09-28T08:00:00Z',players:null,status:'UNKNOWN'},
    {serverId:'mc',at:'2026-09-28T11:00:00Z',players:35,status:'LIVE',sourceName:'Minecraft SLP'},
    {serverId:'mc',at:'2026-09-29T01:00:00Z',players:99,status:'LIVE'},
  ]
  const points=observedHistory(samples,'24h',now)
  assert.deepEqual(points.map(point=>point.players),[12,35])
  assert.equal(points[0].x,13/24)
  assert.equal(points[1].x,23/24)
  assert.equal(points[0].sourceName,'Minecraft SLP')
  assert.deepEqual(observedHistory(samples,'7d',now).map(point=>point.at),points.map(point=>point.at))
})

test('public history keeps source observation and fetch times, but unknown count is null',()=>{
  const known=sampleDto({server_id:'mc',at:'2026-09-28T10:00:00Z',players:21,players_known:1,
    status:'LIVE',source_tier:'DIRECT',source_name:'Minecraft SLP',fetched_at:'2026-09-28T10:01:00Z'})
  assert.equal(known.players,21)
  assert.equal(known.sourceName,'Minecraft SLP')
  assert.equal(known.fetchedAt,'2026-09-28T10:01:00Z')
  const unknown=sampleDto({...known,server_id:'mc',players:0,players_known:0})
  assert.equal(unknown.players,null)
})
