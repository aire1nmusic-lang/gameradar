import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { migrate } from '../private-api/db.mjs'
import { backfillInitialProjection, fetchCoreCatalog } from '../private-api/backfill-public-projection.mjs'

const cards=[
  {serverId:'l2-1',gameId:'lineage2',slug:'l2-one'},
  {serverId:'mc-1',gameId:'minecraft',slug:'mc-one'},
  {serverId:'gta-1',gameId:'gtarp',slug:'gta-one'},
]

async function fixture(t) {
  const pg=new PGlite()
  t.after(()=>pg.close())
  const db={query:(sql,args=[])=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)}
  await migrate(db)
  for (const card of cards) await db.query(
    'INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$2,$3,$4)',
    [card.serverId,card.gameId,card.slug,card.slug])
  return db
}

test('initial projection backfill is read-only by default and idempotently enqueues three games',async t=>{
  const db=await fixture(t)
  assert.deepEqual(await backfillInitialProjection(db,cards),
    {mode:'dry-run',registry:3,initial:3,enqueued:0})
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gs_public_outbox')).rows[0].n,0)
  assert.deepEqual(await backfillInitialProjection(db,cards,{apply:true}),
    {mode:'apply',registry:3,initial:3,enqueued:3})
  const rows=(await db.query('SELECT server_id,version,payload FROM gs_public_outbox ORDER BY server_id')).rows
  assert.equal(rows.length,3)
  for (const row of rows) {
    assert.equal(Number(row.version),1)
    assert.deepEqual(row.payload,{serverId:row.server_id,version:1,claimed:false,
      restrictedLinks:[],restrictedMaterials:[],supportCoins:0,supportParticipants:0})
    assert.ok(!JSON.stringify(row.payload).includes('email'))
  }
  assert.deepEqual(await backfillInitialProjection(db,cards,{apply:true}),
    {mode:'apply',registry:3,initial:0,enqueued:0})
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gs_public_outbox')).rows[0].n,3)
})

test('catalog identity mismatch and outbox failure leave all private versions unchanged',async t=>{
  const db=await fixture(t)
  await assert.rejects(backfillInitialProjection(db,cards.slice(0,2),{apply:true}),
    /private_public_catalog_count_mismatch/)
  const failing={...db,transaction:fn=>db.transaction(tx=>fn({
    ...tx,query:async(sql,args)=>{
      if (sql.startsWith('INSERT INTO gs_public_outbox') && args[0]==='l2-1') throw new Error('outbox_down')
      return tx.query(sql,args)
    },
  }))}
  await assert.rejects(backfillInitialProjection(failing,cards,{apply:true}),/outbox_down/)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gs_server_registry WHERE version=0')).rows[0].n,3)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gs_public_outbox')).rows[0].n,0)
})

test('public catalog capture accepts only published core cards and rejects unstable pages',async()=>{
  const page={items:[...cards.map(card=>({id:card.serverId,gameId:card.gameId,slug:card.slug,moderation:'PUBLISHED'})),
    {id:'demo',gameId:'gtarp',slug:'demo',demo:true,moderation:'PUBLISHED'},
    {id:'hidden',gameId:'rust',slug:'hidden',moderation:'PUBLISHED'}],total:5,offset:0,limit:100}
  const fake=async()=>({ok:true,json:async()=>page})
  assert.deepEqual(await fetchCoreCatalog('https://gamescout.online/',fake),cards)
  await assert.rejects(fetchCoreCatalog('http://gamescout.online/',fake),/catalog_origin_must_be_https_root/)
  await assert.rejects(fetchCoreCatalog('https://gamescout.online/',async()=>({ok:true,json:async()=>({...page,total:6})})),
    /catalog_page_incomplete/)
})
