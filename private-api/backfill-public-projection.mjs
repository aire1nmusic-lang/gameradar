/** Enqueue initial, public-only snapshots for imported catalog cards without editing catalog facts.
 *
 * Run inside the private API container. Without --apply this is read-only:
 *   node private-api/backfill-public-projection.mjs
 *   node private-api/backfill-public-projection.mjs --apply
 *
 * Apply only after a verified off-VM restore. The normal maintenance job delivers the outbox.
 */
import { pathToFileURL } from 'node:url'
import { postgresStore } from './db.mjs'
import { productionConfig } from './production-config.mjs'
import { createPublicSnapshot } from './public-snapshot.mjs'

const GAMES = new Set(['lineage2', 'minecraft', 'gtarp'])

export async function fetchCoreCatalog(origin, fetchImpl=fetch) {
  const base = new URL(origin)
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash)
    throw new Error('catalog_origin_must_be_https_root')
  const cards = []
  let total
  let complete=false
  for (let offset=0; offset<=100000; offset+=100) {
    const response = await fetchImpl(new URL(`/api/v1/servers?limit=100&offset=${offset}`, base), {
      headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)})
    if (!response.ok) throw new Error(`catalog_http_${response.status}`)
    const page = await response.json()
    if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total<0
      || page.offset!==offset || page.limit!==100 || (total!==undefined && total!==page.total))
      throw new Error('catalog_page_changed_or_invalid')
    total=page.total
    for (const card of page.items) if (GAMES.has(card.gameId) && !card.demo && card.moderation==='PUBLISHED')
      cards.push({serverId:card.id,gameId:card.gameId,slug:card.slug})
    if (offset+page.items.length>=total) {
      if (offset+page.items.length!==total) throw new Error('catalog_count_changed')
      complete=true
      break
    }
    if (page.items.length!==100) throw new Error('catalog_page_incomplete')
  }
  if (!complete || !cards.length || new Set(cards.map(card=>card.serverId)).size!==cards.length
    || cards.some(card=>typeof card.serverId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(card.serverId)
      ||typeof card.slug!=='string'||!card.slug)) throw new Error('catalog_core_cards_invalid')
  return cards
}

function reconcile(rows,cards) {
  const publicById=new Map(cards.map(card=>[card.serverId,card]))
  if (rows.length!==publicById.size) throw new Error('private_public_catalog_count_mismatch')
  for (const row of rows) {
    const card=publicById.get(row.server_id)
    if (!card || card.gameId!==row.game_id || card.slug!==row.slug) throw new Error('private_public_catalog_identity_mismatch')
  }
  return rows.filter(row=>Number(row.version)===0)
}

export async function backfillInitialProjection(db,cards,{apply=false}={}) {
  if (!apply) {
    const rows=(await db.query('SELECT server_id,game_id,slug,version FROM gs_server_registry ORDER BY server_id')).rows
    const initial=reconcile(rows,cards)
    return {mode:'dry-run',registry:rows.length,initial:initial.length,enqueued:0}
  }
  return db.transaction(async tx=>{
    const rows=(await tx.query('SELECT server_id,game_id,slug,version FROM gs_server_registry ORDER BY server_id FOR UPDATE')).rows
    const initial=reconcile(rows,cards)
    for (const row of initial) {
      const changed=(await tx.query('UPDATE gs_server_registry SET version=1 WHERE server_id=$1 AND version=0 RETURNING version',[row.server_id])).rows[0]
      if (!changed) throw new Error('initial_projection_version_race')
      const snapshot=await createPublicSnapshot(tx,row.server_id,changed.version)
      await tx.query('INSERT INTO gs_public_outbox(server_id,version,payload) VALUES($1,$2,$3)',
        [row.server_id,changed.version,JSON.stringify(snapshot)])
    }
    return {mode:'apply',registry:rows.length,initial:initial.length,enqueued:initial.length}
  })
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {config,connectionString,ca}=await productionConfig(process.env)
  if (!config.publicProjection || !config.projectionSecret) throw new Error('public_projection_not_configured')
  const cards=await fetchCoreCatalog(process.env.PUBLIC_ORIGIN || 'https://gamescout.online/')
  const db=postgresStore(connectionString,ca)
  try { console.log(JSON.stringify(await backfillInitialProjection(db,cards,{apply:process.argv.includes('--apply')}))) }
  finally { await db.close() }
}
