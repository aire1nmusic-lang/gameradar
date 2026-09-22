import { parseList, now } from './core'
// Database rows stay inside the server; public fields are selected explicitly in DTOs.
export type Row = Record<string, any>
export type Filters = { limit: number; offset: number; query?: string; gameId?: string; gameIds?: string[]; chronicleId?: string; versions?: string[]; modes?: string[]; regions?: string[]; languages?: string[]; minOnline?: number; minRating?: number; verifiedOnly?: boolean; hideOffline?: boolean; openedWithin?: string; wipeSoon?: boolean; onlyLaunching?: boolean; sort?: string }
const serverSelect = `SELECT s.*, o.status AS online_status, o.current AS online_current, o.max AS online_max, o.checked_at, o.source, o.method AS online_method, o.latency_ms, o.note AS online_note, o.change_24h, o.peak_24h, o.avg_7d, o.peak_30d, o.uptime_24h, o.players_known, o.max_known FROM servers s LEFT JOIN server_online o ON o.server_id=s.id`
export class Store {
  constructor(readonly db: D1Database) {}
  async health() { return this.db.prepare('SELECT 1 AS ok').first() }
  async games() { return (await this.db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM servers s WHERE s.game_id=g.id AND s.moderation='PUBLISHED') AS servers_count, (SELECT COALESCE(SUM(o.current),0) FROM server_online o JOIN servers s ON s.id=o.server_id WHERE s.game_id=g.id AND s.moderation='PUBLISHED' AND o.status IN ('LIVE','VERIFIED') AND o.players_known=1) AS players_online FROM games g ORDER BY sort_order,name`).all<Row>()).results }
  game(key: string) { return this.db.prepare('SELECT * FROM games WHERE id=? OR slug=?').bind(key,key).first<Row>() }
  async chronicles(gameId?: string) { return (await this.db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM servers s WHERE s.chronicle_id=c.id AND s.moderation='PUBLISHED') AS servers_count, (SELECT COALESCE(SUM(o.current),0) FROM server_online o JOIN servers s ON s.id=o.server_id WHERE s.chronicle_id=c.id AND s.moderation='PUBLISHED' AND o.status IN ('LIVE','VERIFIED') AND o.players_known=1) AS players_online FROM chronicles c ${gameId ? 'WHERE c.game_id=?' : ''} ORDER BY sort_order,label`).bind(...(gameId ? [gameId] : [])).all<Row>()).results }
  async chronicleVersions() { return (await this.db.prepare('SELECT * FROM chronicle_versions').all<Row>()).results }
  chronicle(key: string) { return this.db.prepare('SELECT * FROM chronicles WHERE id=?').bind(key).first<Row>() }
  async servers(q: Filters) {
    const where = ["s.moderation='PUBLISHED'"]; const values: unknown[] = []
    const add = (sql: string, ...v: unknown[]) => { where.push(sql); values.push(...v) }
    if (q.query) add("(s.name LIKE ? ESCAPE '\\' OR s.summary LIKE ? ESCAPE '\\')", ...Array(2).fill('%'+q.query.replace(/[\\%_]/g,'\\$&')+'%'))
    if (q.gameId) add('s.game_id=?',q.gameId)
    if (q.chronicleId) add('s.chronicle_id=?',q.chronicleId)
    for (const [column,list] of [['game_id',q.gameIds],['version',q.versions],['region',q.regions]] as const) if (list?.length) add(`s.${column} IN (${list.map(()=>'?').join(',')})`,...list)
    for (const [column,list] of [['modes',q.modes],['languages',q.languages]] as const) if (list?.length) add(`EXISTS (SELECT 1 FROM json_each(s.${column}) WHERE value IN (${list.map(()=>'?').join(',')}))`,...list)
    if (q.minOnline !== undefined) add('COALESCE(o.current,0)>=? AND o.players_known=1',q.minOnline)
    if (q.minRating !== undefined) add('s.rating>=?',q.minRating)
    if (q.verifiedOnly) add("o.status='VERIFIED'")
    if (q.hideOffline) add("COALESCE(o.status,'PENDING')<>'OFFLINE'")
    if (q.onlyLaunching) add('s.launch_at>?',now())
    if (q.wipeSoon) add('s.next_wipe_at BETWEEN ? AND ?',now(),new Date(Date.now()+7*86400000).toISOString())
    if (q.openedWithin && q.openedWithin !== 'any') add('s.opened_at>=?',new Date(Date.now()-Number(q.openedWithin.replace('d',''))*86400000).toISOString())
    const sorts: Record<string,string> = { online:'COALESCE(o.current,0) DESC', growth:'COALESCE(o.change_24h,0) DESC',rating:'s.rating DESC',new:'s.added_at DESC',launch:'s.launch_at ASC',votes:'s.votes_count DESC',recommended:`(CASE WHEN o.status IN ('LIVE','VERIFIED') AND o.players_known=1 THEN MIN(COALESCE(o.current,0),100000)/100.0 ELSE 0 END + s.votes_count*2 + CASE WHEN s.owner_id IS NOT NULL THEN 10 ELSE 0 END + COALESCE(o.uptime_24h,0)/10.0) DESC` }
    const clause = where.join(' AND ')
    const rows = await this.db.prepare(`${serverSelect} WHERE ${clause} ORDER BY ${sorts[q.sort ?? 'recommended'] ?? sorts.recommended},s.id LIMIT ? OFFSET ?`).bind(...values,q.limit,q.offset).all<Row>()
    const count = await this.db.prepare(`SELECT COUNT(*) AS total FROM servers s LEFT JOIN server_online o ON o.server_id=s.id WHERE ${clause}`).bind(...values).first<Row>()
    return { items:rows.results,total:Number(count?.total ?? 0),limit:q.limit,offset:q.offset }
  }
  server(key: string) { return this.db.prepare(`${serverSelect} WHERE s.id=? OR s.slug=?`).bind(key,key).first<Row>() }
  async ownerServers(userId: string) { return (await this.db.prepare(`${serverSelect} WHERE s.owner_id=? OR s.submitted_by=? ORDER BY s.added_at DESC LIMIT 100`).bind(userId,userId).all<Row>()).results }
  async insertServer(row: Row) {
    const fields = Object.keys(row)
    await this.db.batch([this.db.prepare(`INSERT INTO servers (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).bind(...fields.map(k=>row[k])),this.db.prepare(`INSERT INTO server_online(server_id,status,source,method,players_known,max_known) VALUES (?,'PENDING','Ожидает проверки','OWNER_SUBMITTED',0,0)`).bind(row.id)])
    return (await this.server(row.id))!
  }
  async updateServer(serverId: string, ownerId: string, values: Row) {
    const fields=Object.keys(values)
    return this.db.prepare(`UPDATE servers SET ${fields.map(k=>`${k}=?`).join(',')} WHERE id=? AND owner_id=?`).bind(...fields.map(k=>values[k]),serverId,ownerId).run()
  }
  publish(serverId:string) { return this.db.prepare("UPDATE servers SET moderation='PUBLISHED',updated_at=? WHERE id=?").bind(now(),serverId).run() }
  user(userId:string) { return this.db.prepare('SELECT * FROM users WHERE id=?').bind(userId).first<Row>() }
  userByProvider(providerId:string) { return this.db.prepare("SELECT * FROM users WHERE provider='EMAIL' AND provider_id=?").bind(providerId).first<Row>() }
  async createDevUser(row:Row) {
    await this.db.prepare(`INSERT INTO users(id,display_name,provider,provider_id,roles,created_at) VALUES (?,?,'EMAIL',?,'["PLAYER","OWNER"]',?) ON CONFLICT(provider,provider_id) DO NOTHING`).bind(row.id,row.displayName,row.providerId,row.createdAt).run()
    return (await this.userByProvider(row.providerId))!
  }
  createSession(hash:string,userId:string,expires:string) { return this.db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)').bind(hash,userId,now(),expires).run() }
  session(hash:string) { return this.db.prepare('SELECT u.* FROM sessions ss JOIN users u ON u.id=ss.user_id WHERE ss.token_hash=? AND ss.expires_at>?').bind(hash,now()).first<Row>() }
  deleteSession(hash:string) { return this.db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run() }
  async deleteExpiredSessions() { await this.db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()).run() }
  async createClaim(row:Row) { await this.db.prepare(`INSERT INTO server_claims(id,server_id,user_id,method,proof_token,created_at) VALUES (?,?,?,'SITE_FILE',?,?)`).bind(row.id,row.serverId,row.userId,row.proofToken,row.createdAt).run(); return (await this.claim(row.id))! }
  claim(claimId:string) { return this.db.prepare('SELECT * FROM server_claims WHERE id=?').bind(claimId).first<Row>() }
  async userClaims(userId:string) { return (await this.db.prepare('SELECT * FROM server_claims WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(userId).all<Row>()).results }
  activeClaim(serverId:string,userId:string) { return this.db.prepare("SELECT * FROM server_claims WHERE server_id=? AND user_id=? AND status='PENDING' AND created_at>? ORDER BY created_at DESC LIMIT 1").bind(serverId,userId,new Date(Date.now()-86400000).toISOString()).first<Row>() }
  claimAttempt(claimId:string) { return this.db.prepare("UPDATE server_claims SET attempts=attempts+1 WHERE id=? AND status='PENDING' AND attempts<20 RETURNING *").bind(claimId).first<Row>() }
  async verifyClaim(claimId:string,serverId:string,userId:string) {
    await this.db.batch([
      this.db.prepare("UPDATE servers SET owner_id=?,updated_at=? WHERE id=? AND (owner_id IS NULL OR owner_id=?) AND EXISTS (SELECT 1 FROM server_claims WHERE id=? AND user_id=? AND server_id=? AND status='PENDING')").bind(userId,now(),serverId,userId,claimId,userId,serverId),
      this.db.prepare("UPDATE server_claims SET status='VERIFIED',resolved_at=? WHERE id=? AND status='PENDING' AND EXISTS (SELECT 1 FROM servers WHERE id=? AND owner_id=?)").bind(now(),claimId,serverId,userId)
    ])
    return (await this.claim(claimId))!
  }
  integration(serverId:string) { return this.db.prepare('SELECT * FROM vote_integrations WHERE server_id=?').bind(serverId).first<Row>() }
  integrationByHash(hash:string) { return this.db.prepare('SELECT vi.* FROM vote_integrations vi JOIN servers s ON s.id=vi.server_id WHERE vi.api_key_hash=? AND vi.has_api_key=1 AND s.owner_id IS NOT NULL').bind(hash).first<Row>() }
  async ensureIntegration(serverId:string) { await this.db.prepare("INSERT INTO vote_integrations(server_id,api_key_hash,updated_at) VALUES (?,?,?) ON CONFLICT(server_id) DO NOTHING").bind(serverId,'disabled:'+serverId,now()).run(); return (await this.integration(serverId))! }
  async updateIntegration(serverId:string,fields:Row) { const keys=Object.keys(fields); await this.db.prepare(`UPDATE vote_integrations SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=? WHERE server_id=?`).bind(...keys.map(k=>fields[k]),now(),serverId).run(); return (await this.integration(serverId))! }
  async insertVote(row:Row,cooldownSince:string,rateSince:string) {
    const result=await this.db.batch([
      this.db.prepare(`INSERT INTO votes(id,server_id,nickname,user_id,voter_key,ip_hash,delivery,created_at) SELECT ?,?,?,?,?,?,'PULL_API',? WHERE NOT EXISTS (SELECT 1 FROM votes WHERE server_id=? AND voter_key=? AND created_at>?) AND (SELECT COUNT(*) FROM votes WHERE ip_hash=? AND created_at>?)<30 AND (SELECT COUNT(*) FROM votes WHERE server_id=? AND ip_hash=? AND created_at>?)<5`).bind(row.id,row.serverId,row.nickname,row.userId ?? null,row.voterKey,row.ipHash,row.createdAt,row.serverId,row.voterKey,cooldownSince,row.ipHash,rateSince,row.serverId,row.ipHash,rateSince),
      this.db.prepare('UPDATE servers SET votes_count=(SELECT COUNT(*) FROM votes WHERE server_id=? AND status<>\'REJECTED\') WHERE id=?').bind(row.serverId,row.serverId)
    ])
    return result[0].meta.changes > 0
  }
  lastVote(serverId:string,key:string) { return this.db.prepare('SELECT * FROM votes WHERE server_id=? AND voter_key=? ORDER BY created_at DESC LIMIT 1').bind(serverId,key).first<Row>() }
  vote(voteId:string) { return this.db.prepare('SELECT * FROM votes WHERE id=?').bind(voteId).first<Row>() }
  async pendingVotes(serverId:string,limit:number,offset:number) { const items=(await this.db.prepare("SELECT * FROM votes WHERE server_id=? AND status='PENDING' ORDER BY created_at,id LIMIT ? OFFSET ?").bind(serverId,limit,offset).all<Row>()).results; const count=await this.db.prepare("SELECT COUNT(*) AS total FROM votes WHERE server_id=? AND status='PENDING'").bind(serverId).first<Row>();return {items,total:Number(count?.total ?? 0),limit,offset} }
  async claimVotes(serverId:string,ids:string[]) { return (await this.db.prepare(`UPDATE votes SET status='CLAIMED',claimed_at=?,delivered_at=? WHERE server_id=? AND status='PENDING' AND id IN (${ids.map(()=>'?').join(',')}) RETURNING *`).bind(now(),now(),serverId,...ids).all<Row>()).results }
  async onlineHistory(serverId:string,since:string,limit:number) { return (await this.db.prepare('SELECT server_id,at,players,status,latency_ms,players_known FROM online_samples WHERE server_id=? AND at>=? ORDER BY at DESC,id DESC LIMIT ?').bind(serverId,since,limit).all<Row>()).results.reverse() }
  target(serverId:string) { return this.db.prepare('SELECT * FROM monitoring_targets WHERE server_id=?').bind(serverId).first<Row>() }
  async setTarget(serverId:string,target:Row) { await this.db.prepare(`INSERT INTO monitoring_targets(server_id,method,host,port,api_url,enabled) VALUES (?,?,?,?,?,?) ON CONFLICT(server_id) DO UPDATE SET method=excluded.method,host=excluded.host,port=excluded.port,api_url=excluded.api_url,enabled=excluded.enabled`).bind(serverId,target.method,target.host ?? null,target.port ?? null,target.apiUrl ?? null,target.enabled === false ? 0 : 1).run();return this.target(serverId) }
  async targets(limit=25) { return (await this.db.prepare("SELECT t.*,g.slug AS game_slug FROM monitoring_targets t JOIN servers s ON s.id=t.server_id JOIN games g ON g.id=s.game_id WHERE t.enabled=1 AND s.moderation='PUBLISHED' ORDER BY COALESCE((SELECT checked_at FROM server_online WHERE server_id=t.server_id),'') LIMIT ?").bind(limit).all<Row>()).results }
  async saveSample(serverId:string,p:Row) {
    await this.db.batch([
      this.db.prepare('INSERT INTO online_samples(server_id,at,players,status,latency_ms,players_known) VALUES (?,?,?,?,?,?)').bind(serverId,p.checkedAt,p.online ?? 0,p.status,p.latencyMs ?? null,p.online == null ? 0 : 1),
      this.db.prepare(`INSERT INTO server_online(server_id,status,current,max,checked_at,source,method,latency_ms,note,players_known,max_known) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(server_id) DO UPDATE SET status=excluded.status,current=excluded.current,max=excluded.max,checked_at=excluded.checked_at,source=excluded.source,method=excluded.method,latency_ms=excluded.latency_ms,note=excluded.note,players_known=excluded.players_known,max_known=excluded.max_known`).bind(serverId,p.status,p.online ?? 0,p.maxOnline ?? 0,p.checkedAt,p.source,p.method,p.latencyMs ?? null,p.note ?? null,p.online == null ? 0 : 1,p.maxOnline == null ? 0 : 1),
      this.db.prepare(`UPDATE server_online SET peak_24h=COALESCE((SELECT MAX(players) FROM online_samples WHERE server_id=? AND players_known=1 AND at>?),0),avg_7d=COALESCE((SELECT ROUND(AVG(players)) FROM online_samples WHERE server_id=? AND players_known=1 AND at>?),0),peak_30d=COALESCE((SELECT MAX(players) FROM online_samples WHERE server_id=? AND players_known=1 AND at>?),0),uptime_24h=COALESCE((SELECT 100.0*SUM(CASE WHEN status IN ('LIVE','VERIFIED') THEN 1 ELSE 0 END)/COUNT(*) FROM online_samples WHERE server_id=? AND at>?),0) WHERE server_id=?`).bind(serverId,new Date(Date.now()-86400000).toISOString(),serverId,new Date(Date.now()-7*86400000).toISOString(),serverId,new Date(Date.now()-30*86400000).toISOString(),serverId,new Date(Date.now()-86400000).toISOString(),serverId)
    ])
  }
}
