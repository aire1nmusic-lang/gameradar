import { parseList, now, freshSince } from './core'
// Database rows stay inside the server; public fields are selected explicitly in DTOs.
export type Row = Record<string, any>
export type Filters = { limit: number; offset: number; query?: string; gameId?: string; gameIds?: string[]; chronicleId?: string; versions?: string[]; modes?: string[]; regions?: string[]; languages?: string[]; minOnline?: number; minRating?: number; verifiedOnly?: boolean; hideOffline?: boolean; openedWithin?: string; wipeSoon?: boolean; onlyLaunching?: boolean; sort?: string }
const serverSelect = `SELECT s.*, p.restricted_links, p.restricted_materials, p.support_coins, p.support_participants, o.status AS online_status, o.current AS online_current, o.max AS online_max, o.checked_at, o.observed_at, o.source, o.source_tier, o.source_url, o.method AS online_method, o.latency_ms, o.note AS online_note, o.change_24h, o.peak_24h, o.avg_7d, o.peak_30d, o.uptime_24h, o.players_known, o.max_known, o.checks_24h, t.method AS target_method, t.host AS target_host, t.port AS target_port FROM servers s LEFT JOIN public_server_projection p ON p.server_id=s.id LEFT JOIN server_online o ON o.server_id=s.id LEFT JOIN monitoring_targets t ON t.server_id=s.id AND t.enabled=1`
/** A number counts only while it is fresh; an old one is history, not "online". */
const FRESH = `o.players_known=1 AND COALESCE(o.observed_at,o.checked_at)>?`
const ONLINE_STATUSES = `o.status IN ('VERIFIED','LIVE','EXTERNAL','OWNER_REPORTED')`
/** Trust weight of a player count: our own measurement outranks what others report. */
const TRUST = `(CASE o.status WHEN 'VERIFIED' THEN 1.0 WHEN 'LIVE' THEN 0.6 WHEN 'EXTERNAL' THEN 0.4 WHEN 'OWNER_REPORTED' THEN 0.25 ELSE 0 END)`
export class Store {
  /** DEMO fixtures exist only for development; everywhere else they do not exist at all. */
  constructor(readonly db: D1Database, readonly showDemo = false) {}
  private get live() { return this.showDemo ? '' : ' AND s.is_demo=0' }
  async health() { return this.db.prepare('SELECT 1 AS ok').first() }
  async games() { return (await this.db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM servers s WHERE s.game_id=g.id AND s.moderation='PUBLISHED'${this.live}) AS servers_count, (SELECT COALESCE(SUM(o.current),0) FROM server_online o JOIN servers s ON s.id=o.server_id WHERE s.game_id=g.id AND s.moderation='PUBLISHED'${this.live} AND ${ONLINE_STATUSES} AND ${FRESH}) AS players_online FROM games g ORDER BY sort_order,name`).bind(freshSince()).all<Row>()).results }
  game(key: string) { return this.db.prepare('SELECT * FROM games WHERE id=? OR slug=?').bind(key,key).first<Row>() }
  async chronicles(gameId?: string) { return (await this.db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM servers s WHERE s.chronicle_id=c.id AND s.moderation='PUBLISHED'${this.live}) AS servers_count, (SELECT COALESCE(SUM(o.current),0) FROM server_online o JOIN servers s ON s.id=o.server_id WHERE s.chronicle_id=c.id AND s.moderation='PUBLISHED'${this.live} AND ${ONLINE_STATUSES} AND ${FRESH}) AS players_online FROM chronicles c ${gameId ? 'WHERE c.game_id=?' : ''} ORDER BY sort_order,label`).bind(freshSince(),...(gameId ? [gameId] : [])).all<Row>()).results }
  async chronicleVersions() { return (await this.db.prepare('SELECT * FROM chronicle_versions').all<Row>()).results }
  chronicle(key: string) { return this.db.prepare('SELECT * FROM chronicles WHERE id=?').bind(key).first<Row>() }
  async servers(q: Filters) {
    const where = ["s.moderation='PUBLISHED'" + this.live]; const values: unknown[] = []
    const add = (sql: string, ...v: unknown[]) => { where.push(sql); values.push(...v) }
    if (q.query) add("(s.name LIKE ? ESCAPE '\\' OR (COALESCE(p.restricted_materials,'[]') NOT LIKE '%description%' AND s.summary LIKE ? ESCAPE '\\'))", ...Array(2).fill('%'+q.query.replace(/[\\%_]/g,'\\$&')+'%'))
    if (q.gameId) add('s.game_id=?',q.gameId)
    if (q.chronicleId) add('s.chronicle_id=?',q.chronicleId)
    for (const [column,list] of [['game_id',q.gameIds],['version',q.versions],['region',q.regions]] as const) if (list?.length) add(`s.${column} IN (${list.map(()=>'?').join(',')})`,...list)
    for (const [column,list] of [['modes',q.modes],['languages',q.languages]] as const) if (list?.length) add(`EXISTS (SELECT 1 FROM json_each(s.${column}) WHERE value IN (${list.map(()=>'?').join(',')}))`,...list)
    if (q.minOnline !== undefined) add(`COALESCE(o.current,0)>=? AND ${FRESH}`,q.minOnline,freshSince())
    if (q.minRating !== undefined) add('s.rating>=?',q.minRating)
    if (q.verifiedOnly) add("o.status='VERIFIED'")
    if (q.hideOffline) add("COALESCE(o.status,'PENDING')<>'OFFLINE'")
    if (q.onlyLaunching) add('s.launch_at>?',now())
    if (q.wipeSoon) add('s.next_wipe_at BETWEEN ? AND ?',now(),new Date(Date.now()+7*86400000).toISOString())
    if (q.openedWithin && q.openedWithin !== 'any') add('s.opened_at>=?',new Date(Date.now()-Number(q.openedWithin.replace('d',''))*86400000).toISOString())
    const fresh = `(CASE WHEN ${FRESH.replace('?',"'"+freshSince()+"'")} THEN COALESCE(o.current,0) ELSE 0 END)`
    const sorts: Record<string,string> = { online:`${fresh} DESC`, growth:'COALESCE(o.change_24h,0) DESC',rating:'s.rating DESC',new:'s.added_at DESC',launch:'s.launch_at ASC',votes:'s.votes_count DESC',recommended:`(MIN(${fresh},100000)*${TRUST}/100.0 + s.votes_count*2 + CASE WHEN s.owner_id IS NOT NULL THEN 10 ELSE 0 END + COALESCE(o.uptime_24h,0)/10.0) DESC` }
    const clause = where.join(' AND ')
    const rows = await this.db.prepare(`${serverSelect} WHERE ${clause} ORDER BY ${sorts[q.sort ?? 'recommended'] ?? sorts.recommended},s.id LIMIT ? OFFSET ?`).bind(...values,q.limit,q.offset).all<Row>()
    const count = await this.db.prepare(`SELECT COUNT(*) AS total FROM servers s LEFT JOIN public_server_projection p ON p.server_id=s.id LEFT JOIN server_online o ON o.server_id=s.id WHERE ${clause}`).bind(...values).first<Row>()
    return { items:rows.results,total:Number(count?.total ?? 0),limit:q.limit,offset:q.offset }
  }
  server(key: string) { return this.db.prepare(`${serverSelect} WHERE (s.id=? OR s.slug=?)${this.live}`).bind(key,key).first<Row>() }
  /** Cards the user manages: owned ones, plus own submissions nobody has claimed yet. */
  async ownerServers(userId: string) { return (await this.db.prepare(`${serverSelect} WHERE s.owner_id=? OR (s.owner_id IS NULL AND s.submitted_by=?) ORDER BY s.added_at DESC LIMIT 100`).bind(userId,userId).all<Row>()).results }
  /** Public cards for the sitemap. DEMO rows never appear here. */
  async sitemapServers() { return (await this.db.prepare("SELECT slug, updated_at FROM servers WHERE moderation='PUBLISHED' AND is_demo=0 ORDER BY updated_at DESC LIMIT 45000").all<Row>()).results }
  async supportRanking(limit:number,offset:number) { return (await this.db.prepare(`SELECT s.id AS server_id,s.slug,s.name,s.game_id,
    COALESCE(p.support_coins,0) AS coins,COALESCE(p.support_participants,0) AS participants
    FROM servers s LEFT JOIN public_server_projection p ON p.server_id=s.id
    WHERE s.moderation='PUBLISHED'${this.live}
    ORDER BY coins DESC,participants DESC,s.id LIMIT ? OFFSET ?`).bind(limit,offset).all<Row>()).results }
  async slugTaken(slug:string) { return !!(await this.db.prepare('SELECT 1 AS hit FROM servers WHERE slug=?').bind(slug).first<Row>()) }
  /** Same game and name, or same site host and version, among cards that are not archived. */
  findDuplicate(gameId:string,name:string,website:string,version:string) {
    let host = ''
    try { host = new URL(website).hostname.replace(/^www\./,'') } catch {}
    return this.db.prepare(`SELECT id, slug FROM servers WHERE game_id=? AND moderation<>'ARCHIVED' AND is_demo=0 AND (lower(trim(name))=lower(trim(?)) OR (?<>'' AND version=? AND (website LIKE ? OR website LIKE ?))) LIMIT 1`).bind(gameId,name,host,version,`%://${host}/%`,`%://www.${host}/%`).first<Row>()
  }
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
  /** Creates or refreshes the account behind an OAuth identity; the (provider, provider_id) pair is unique. */
  async upsertOAuthUser(provider:string,providerId:string,displayName:string,avatarUrl:string|undefined,newId:string) {
    await this.db.prepare(`INSERT INTO users(id,display_name,avatar_url,provider,provider_id,roles,created_at) VALUES (?,?,?,?,?,'["PLAYER","OWNER"]',?) ON CONFLICT(provider,provider_id) DO UPDATE SET display_name=excluded.display_name,avatar_url=excluded.avatar_url`).bind(newId,displayName,avatarUrl ?? null,provider,providerId,now()).run()
    return (await this.db.prepare('SELECT * FROM users WHERE provider=? AND provider_id=?').bind(provider,providerId).first<Row>())!
  }
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
      this.db.prepare(`INSERT INTO votes(id,server_id,nickname,user_id,voter_key,ip_hash,delivery,created_at) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM votes WHERE server_id=? AND voter_key=? AND created_at>?) AND (SELECT COUNT(*) FROM votes WHERE ip_hash=? AND created_at>?)<30 AND (SELECT COUNT(*) FROM votes WHERE server_id=? AND ip_hash=? AND created_at>?)<5`).bind(row.id,row.serverId,row.nickname,row.userId ?? null,row.voterKey,row.ipHash,row.delivery ?? 'PULL_API',row.createdAt,row.serverId,row.voterKey,cooldownSince,row.ipHash,rateSince,row.serverId,row.ipHash,rateSince),
      this.db.prepare('UPDATE servers SET votes_count=(SELECT COUNT(*) FROM votes WHERE server_id=? AND status<>\'REJECTED\') WHERE id=?').bind(row.serverId,row.serverId)
    ])
    return result[0].meta.changes > 0
  }
  /** Inserts unless the same visitor sent the same kind for this card since `since`. */
  async recordEvent(serverId:string,kind:string,source:string|null,visitor:string,since:string) {
    const result = await this.db.prepare('INSERT INTO server_events(server_id,kind,at,source,visitor_hash) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM server_events WHERE server_id=? AND kind=? AND visitor_hash=? AND at>?)').bind(serverId,kind,now(),source,visitor,serverId,kind,visitor,since).run()
    return result.meta.changes > 0
  }
  async serverStats(serverId:string,since:string,days:number) {
    const totals = (await this.db.prepare('SELECT kind, COUNT(*) AS n FROM server_events WHERE server_id=? AND at>? GROUP BY kind').bind(serverId,since).all<Row>()).results
    const daily = (await this.db.prepare("SELECT substr(at,1,10) AS day, COUNT(*) AS n FROM server_events WHERE server_id=? AND kind='VIEW' AND at>? GROUP BY day ORDER BY day").bind(serverId,since).all<Row>()).results
    const votes = await this.db.prepare("SELECT COUNT(*) AS total, SUM(status='PENDING') AS pending, SUM(status='CLAIMED') AS claimed, SUM(created_at>?) AS recent FROM votes WHERE server_id=?").bind(since,serverId).first<Row>()
    const sources = (await this.db.prepare("SELECT COALESCE(source,'direct') AS source, COUNT(*) AS n FROM server_events WHERE server_id=? AND kind='VIEW' AND at>? GROUP BY 1 ORDER BY n DESC LIMIT 6").bind(serverId,since).all<Row>()).results
    const byDay = new Map(daily.map(row => [row.day, Number(row.n)]))
    const views = Array.from({ length: days }, (_, i) => { const day = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10); return { day, value: byDay.get(day) ?? 0 } })
    const count = (kind:string) => Number(totals.find(row => row.kind === kind)?.n ?? 0)
    return { since, views, totals: { views: count('VIEW'), websiteClicks: count('WEBSITE_CLICK'), playClicks: count('PLAY_CLICK'), voteClicks: count('VOTE_CLICK'), claimStarts: count('CLAIM_START') }, votes: { total: Number(votes?.total ?? 0), pending: Number(votes?.pending ?? 0), claimed: Number(votes?.claimed ?? 0), inRange: Number(votes?.recent ?? 0) }, sources: sources.map(row => ({ source: row.source, count: Number(row.n) })) }
  }
  async recentVotes(serverId:string,limit:number) { return (await this.db.prepare('SELECT * FROM votes WHERE server_id=? ORDER BY created_at DESC LIMIT ?').bind(serverId,limit).all<Row>()).results }
  /** Votifier votes still owed to a Minecraft server: pending, under the attempt cap, from the last day, not leased right now. */
  async votifierDue(limit:number,voteId?:string) {
    const day=new Date(Date.now()-86400000).toISOString(), stale=new Date(Date.now()-120000).toISOString()
    return (await this.db.prepare(`SELECT v.*,vi.votifier_host,vi.votifier_port,vi.votifier_token FROM votes v JOIN vote_integrations vi ON vi.server_id=v.server_id JOIN servers s ON s.id=v.server_id WHERE v.status='PENDING' AND v.delivery='VOTIFIER' AND s.game_id='minecraft' AND vi.votifier_host IS NOT NULL AND vi.votifier_port IS NOT NULL AND vi.votifier_token IS NOT NULL AND v.delivery_attempts<? AND v.created_at>? AND (v.delivering_at IS NULL OR v.delivering_at<?)${voteId?' AND v.id=?':''} ORDER BY v.created_at LIMIT ?`).bind(3,day,stale,...(voteId?[voteId]:[]),limit).all<Row>()).results
  }
  /** Takes the send lease; null when another sender holds it. */
  leaseVoteDelivery(voteId:string) { return this.db.prepare(`UPDATE votes SET delivering_at=?,delivery_attempts=delivery_attempts+1 WHERE id=? AND status='PENDING' AND (delivering_at IS NULL OR delivering_at<?) RETURNING id`).bind(now(),voteId,new Date(Date.now()-120000).toISOString()).first<Row>() }
  markVoteDelivered(voteId:string) { return this.db.prepare(`UPDATE votes SET status='CLAIMED',claimed_at=?,delivered_at=?,delivering_at=NULL,last_delivery_error=NULL WHERE id=? AND status='PENDING'`).bind(now(),now(),voteId).run() }
  markVoteDeliveryFailed(voteId:string,code:string) { return this.db.prepare(`UPDATE votes SET delivering_at=NULL,last_delivery_error=? WHERE id=?`).bind(code.slice(0,60),voteId).run() }
  lastVote(serverId:string,key:string) { return this.db.prepare('SELECT * FROM votes WHERE server_id=? AND voter_key=? ORDER BY created_at DESC LIMIT 1').bind(serverId,key).first<Row>() }
  vote(voteId:string) { return this.db.prepare('SELECT * FROM votes WHERE id=?').bind(voteId).first<Row>() }
  async pendingVotes(serverId:string,limit:number,offset:number) { const items=(await this.db.prepare("SELECT * FROM votes WHERE server_id=? AND status='PENDING' AND delivery='PULL_API' ORDER BY created_at,id LIMIT ? OFFSET ?").bind(serverId,limit,offset).all<Row>()).results; const count=await this.db.prepare("SELECT COUNT(*) AS total FROM votes WHERE server_id=? AND status='PENDING' AND delivery='PULL_API'").bind(serverId).first<Row>();return {items,total:Number(count?.total ?? 0),limit,offset} }
  async claimVotes(serverId:string,ids:string[]) { return (await this.db.prepare(`UPDATE votes SET status='CLAIMED',claimed_at=?,delivered_at=? WHERE server_id=? AND status='PENDING' AND delivery='PULL_API' AND id IN (${ids.map(()=>'?').join(',')}) RETURNING *`).bind(now(),now(),serverId,...ids).all<Row>()).results }
  async onlineHistory(serverId:string,since:string,limit:number) { return (await this.db.prepare('SELECT server_id,at,players,status,latency_ms,players_known,source_tier,source_name,fetched_at FROM online_samples WHERE server_id=? AND at>=? ORDER BY at DESC,id DESC LIMIT ?').bind(serverId,since,limit).all<Row>()).results.reverse() }
  target(serverId:string) { return this.db.prepare('SELECT * FROM monitoring_targets WHERE server_id=?').bind(serverId).first<Row>() }
  async setTarget(serverId:string,target:Row) { await this.db.prepare(`INSERT INTO monitoring_targets(server_id,method,host,port,api_url,enabled) VALUES (?,?,?,?,?,?) ON CONFLICT(server_id) DO UPDATE SET method=excluded.method,host=excluded.host,port=excluded.port,api_url=excluded.api_url,enabled=excluded.enabled`).bind(serverId,target.method,target.host ?? null,target.port ?? null,target.apiUrl ?? null,target.enabled === false ? 0 : 1).run();return this.target(serverId) }
  /** Published cards with a direct target or an online source, least recently checked first. */
  /** `providers` — the sources this Worker can read now; a card with none of them is not queued at all. */
  async monitorQueue(limit:number,providers:string[]) { return (await this.db.prepare(`SELECT s.id AS server_id,g.slug AS game_slug,t.server_id AS target_id,t.method,t.host,t.port,t.api_url,t.expect_name FROM servers s JOIN games g ON g.id=s.game_id LEFT JOIN monitoring_targets t ON t.server_id=s.id AND t.enabled=1 LEFT JOIN server_online o ON o.server_id=s.id WHERE s.moderation='PUBLISHED' AND (t.server_id IS NOT NULL OR EXISTS (SELECT 1 FROM online_sources os WHERE os.server_id=s.id AND os.enabled=1 AND os.provider IN (${providers.map(()=>'?').join(',') || "''"}))) ORDER BY CASE WHEN o.checked_at IS NULL OR o.status='PENDING' OR o.source='Нет источника' THEN 0 ELSE 1 END,COALESCE(o.attempted_at,o.checked_at,''),s.id LIMIT ?`).bind(...providers,limit).all<Row>()).results }
  /** Stamps the attempt before probing, so a check that crashes the invocation cannot pin the queue. */
  lease(serverId:string) { return this.db.prepare('UPDATE server_online SET attempted_at=? WHERE server_id=?').bind(now(),serverId).run() }
  /**
   * A published card with nothing to read its online from is not "waiting for a
   * check" — it becomes UNKNOWN with the reason, instead of PENDING forever.
   * Announced openings keep PENDING until the opening time.
   */
  markSourceless(providers:string[],note:string) { return this.db.prepare(`UPDATE server_online SET status='UNKNOWN',method='NONE',source='Нет источника',source_tier=NULL,source_url=NULL,note=?,current=0,players_known=0,max_known=0,checked_at=?,observed_at=? WHERE status='PENDING' AND server_id IN (SELECT s.id FROM servers s WHERE s.moderation='PUBLISHED' AND (s.launch_at IS NULL OR s.launch_at<=?) AND NOT EXISTS (SELECT 1 FROM monitoring_targets t WHERE t.server_id=s.id AND t.enabled=1) AND NOT EXISTS (SELECT 1 FROM online_sources os WHERE os.server_id=s.id AND os.enabled=1 AND os.provider IN (${providers.map(()=>'?').join(',') || "''"})))`).bind(note,now(),now(),now(),...providers).run() }
  async onlineSources(serverIds:string[]) { if(!serverIds.length)return []; return (await this.db.prepare(`SELECT * FROM online_sources WHERE enabled=1 AND server_id IN (${serverIds.map(()=>'?').join(',')})`).bind(...serverIds).all<Row>()).results }
  async saveSample(serverId:string,p:Row) {
    const known = p.online == null ? 0 : 1
    const observedAt = p.observedAt ?? p.checkedAt
    const day = new Date(Date.now()-86400000).toISOString()
    const twoDays = new Date(Date.now()-2*86400000).toISOString()
    const nowUtc = new Date()
    const longWindowDue = nowUtc.getUTCHours() % 6 === 0 && nowUtc.getUTCMinutes() < 20
    await this.db.batch([
      this.db.prepare('INSERT INTO online_samples(server_id,at,players,status,latency_ms,players_known,source_tier,source_name,source_url,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(serverId,observedAt,p.online ?? 0,p.status,p.latencyMs ?? null,known,p.tier ?? null,p.source ?? null,p.sourceUrl ?? null,p.checkedAt),
      this.db.prepare(`INSERT INTO server_online(server_id,status,current,max,checked_at,observed_at,source,source_tier,source_url,method,latency_ms,note,players_known,max_known) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(server_id) DO UPDATE SET status=excluded.status,current=excluded.current,max=excluded.max,checked_at=excluded.checked_at,observed_at=excluded.observed_at,source=excluded.source,source_tier=excluded.source_tier,source_url=excluded.source_url,method=excluded.method,latency_ms=excluded.latency_ms,note=excluded.note,players_known=excluded.players_known,max_known=excluded.max_known`).bind(serverId,p.status,p.online ?? 0,p.maxOnline ?? 0,p.checkedAt,observedAt,p.source,p.tier ?? null,p.sourceUrl ?? null,p.method,p.latencyMs ?? null,p.note ?? null,known,p.maxOnline == null ? 0 : 1),
      // Rollups read the index range (server_id, at), never the whole history: one pass over the last 48 h
      // gives peak, uptime and the checks fetched in 24 h (a sample is never observed long before it is fetched).
      // Uptime counts every answer that said "up", from any tier; UNKNOWN is no answer and is left out.
      this.db.prepare(`UPDATE server_online SET (peak_24h,uptime_24h,checks_24h)=(SELECT COALESCE(MAX(CASE WHEN players_known=1 AND at>?1 THEN players END),0),COALESCE(100.0*SUM(CASE WHEN at>?1 AND status IN ('LIVE','VERIFIED','EXTERNAL','OWNER_REPORTED') THEN 1 ELSE 0 END)/NULLIF(SUM(CASE WHEN at>?1 AND status<>'UNKNOWN' THEN 1 ELSE 0 END),0),0),COALESCE(SUM(CASE WHEN fetched_at>?1 THEN 1 ELSE 0 END),0) FROM online_samples WHERE server_id=?2 AND at>?3),change_24h=COALESCE((SELECT ROUND(100.0*(?4 - first.players)/first.players,1) FROM (SELECT players FROM online_samples WHERE server_id=?2 AND players_known=1 AND at>?1 ORDER BY at LIMIT 1) first WHERE first.players>0 AND ?4 IS NOT NULL),0) WHERE server_id=?2`).bind(day,serverId,twoDays,p.online ?? null),
      // The 7- and 30-day figures move slowly: recompute them once per 6 hours (each card is checked in that
      // 20-minute window once), or right away for a card that has none yet. This was the bulk of D1 reads.
      this.db.prepare(`UPDATE server_online SET avg_7d=COALESCE((SELECT ROUND(AVG(players)) FROM online_samples WHERE server_id=?1 AND players_known=1 AND at>?2),0),peak_30d=COALESCE((SELECT MAX(players) FROM online_samples WHERE server_id=?1 AND players_known=1 AND at>?3),0) WHERE server_id=?1 AND (?4=1 OR (avg_7d=0 AND peak_30d=0))`).bind(serverId,new Date(Date.now()-7*86400000).toISOString(),new Date(Date.now()-30*86400000).toISOString(),longWindowDue ? 1 : 0),
    ])
  }
}
