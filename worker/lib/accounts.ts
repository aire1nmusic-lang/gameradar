/**
 * Accounts, sign-in codes, linked providers, server logos and the admin
 * queues — the data side of worker/routes/accounts.ts.
 */
import { now, parseList } from './core.ts'
import type { Row } from './store.ts'

export type Role = 'PLAYER' | 'OWNER' | 'ADMIN'
export const ROLES: Role[] = ['PLAYER', 'OWNER', 'ADMIN']
/** What every new account can do: vote, favourite, add and claim servers. */
export const DEFAULT_ROLES: Role[] = ['PLAYER', 'OWNER']

export const normalizeEmail = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(email) ? email : undefined
}

export class Accounts {
  constructor(readonly db: D1Database) {}

  /* ── users ─────────────────────────────────────────────────────────── */
  user(id: string) { return this.db.prepare('SELECT * FROM users WHERE id=?').bind(id).first<Row>() }
  userByEmail(email: string) { return this.db.prepare('SELECT * FROM users WHERE email=?').bind(email).first<Row>() }
  async createUser(row: { id: string; email?: string; displayName: string; passwordHash?: string; verified: boolean; avatarUrl?: string; provider?: string; providerId?: string }) {
    const at = now()
    await this.db
      .prepare(`INSERT INTO users(id,email,display_name,avatar_url,provider,provider_id,roles,password_hash,email_verified_at,created_at,last_login_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(row.id, row.email ?? null, row.displayName, row.avatarUrl ?? null, row.provider ?? 'EMAIL', row.providerId ?? null, JSON.stringify(DEFAULT_ROLES), row.passwordHash ?? null, row.verified ? at : null, at, at)
      .run()
    return (await this.user(row.id))!
  }
  setPassword(userId: string, hash: string) { return this.db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(hash, userId).run() }
  markVerified(userId: string) { return this.db.prepare('UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=?').bind(now(), userId).run() }
  setEmail(userId: string, email: string, verified: boolean) { return this.db.prepare('UPDATE users SET email=?, email_verified_at=? WHERE id=?').bind(email, verified ? now() : null, userId).run() }
  touchLogin(userId: string) { return this.db.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(now(), userId).run() }
  setDisplayName(userId: string, name: string) { return this.db.prepare('UPDATE users SET display_name=? WHERE id=?').bind(name, userId).run() }
  setAvatarIfEmpty(userId: string, url: string | undefined) {
    return url ? this.db.prepare('UPDATE users SET avatar_url=COALESCE(avatar_url,?) WHERE id=?').bind(url, userId).run() : undefined
  }
  async addRole(user: Row, role: Role) {
    const roles = new Set(parseList(user.roles))
    if (roles.has(role)) return
    roles.add(role)
    await this.db.prepare('UPDATE users SET roles=? WHERE id=?').bind(JSON.stringify([...roles]), user.id).run()
  }
  setRoles(userId: string, roles: Role[]) { return this.db.prepare('UPDATE users SET roles=? WHERE id=?').bind(JSON.stringify(roles), userId).run() }
  setBanned(userId: string, banned: boolean) {
    return this.db.batch([
      this.db.prepare('UPDATE users SET banned_at=? WHERE id=?').bind(banned ? now() : null, userId),
      // a ban ends every session at once
      ...(banned ? [this.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)] : []),
    ])
  }

  /* ── linked providers ──────────────────────────────────────────────── */
  identities(userId: string) {
    return this.db.prepare('SELECT provider, provider_id, email, created_at FROM user_identities WHERE user_id=? ORDER BY created_at').bind(userId).all<Row>().then(r => r.results)
  }
  identity(provider: string, providerId: string) { return this.db.prepare('SELECT * FROM user_identities WHERE provider=? AND provider_id=?').bind(provider, providerId).first<Row>() }
  linkIdentity(provider: string, providerId: string, userId: string, email?: string) {
    return this.db
      .prepare('INSERT INTO user_identities(provider,provider_id,user_id,email,created_at) VALUES (?,?,?,?,?) ON CONFLICT(provider,provider_id) DO NOTHING')
      .bind(provider, providerId, userId, email ?? null, now())
      .run()
  }
  unlinkIdentity(userId: string, provider: string) {
    return this.db.batch([
      this.db.prepare('DELETE FROM user_identities WHERE user_id=? AND provider=?').bind(userId, provider),
      // the legacy columns must not bring the link back on the next sign-in
      this.db.prepare("UPDATE users SET provider='EMAIL', provider_id=NULL WHERE id=? AND lower(provider)=?").bind(userId, provider),
    ])
  }
  /** Accounts created by the first Discord sign-in, before user_identities existed. */
  legacyUser(provider: string, providerId: string) {
    return this.db.prepare('SELECT * FROM users WHERE provider=? AND provider_id=?').bind(provider.toUpperCase(), providerId).first<Row>()
  }

  /* ── emailed codes ─────────────────────────────────────────────────── */
  insertCode(row: { id: string; email: string; purpose: string; codeHash: string; payload?: string; expiresAt: string; ipHash: string }) {
    return this.db
      .prepare('INSERT INTO auth_codes(id,email,purpose,code_hash,payload,expires_at,created_at,ip_hash) VALUES (?,?,?,?,?,?,?,?)')
      .bind(row.id, row.email, row.purpose, row.codeHash, row.payload ?? null, row.expiresAt, now(), row.ipHash)
      .run()
  }
  /** Rows of `purposes` for this email since `since` (codes sent, or FAIL rows for wrong passwords). */
  async countForEmail(email: string, purposes: string[], since: string) {
    return (await this.db.prepare(`SELECT COUNT(*) n FROM auth_codes WHERE email=? AND purpose IN (${purposes.map(() => '?').join(',')}) AND created_at>?`).bind(email, ...purposes, since).first<{ n: number }>())?.n ?? 0
  }
  async countForIp(ipHash: string, purposes: string[], since: string) {
    return (await this.db.prepare(`SELECT COUNT(*) n FROM auth_codes WHERE ip_hash=? AND purpose IN (${purposes.map(() => '?').join(',')}) AND created_at>?`).bind(ipHash, ...purposes, since).first<{ n: number }>())?.n ?? 0
  }
  /** The newest unused code for this email and purpose; older ones are void once a new one is sent. */
  latestCode(email: string, purposes: string[]) {
    return this.db
      .prepare(`SELECT * FROM auth_codes WHERE email=? AND purpose IN (${purposes.map(() => '?').join(',')}) AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`)
      .bind(email, ...purposes)
      .first<Row>()
  }
  /** Counts one try; false once the code has used up `max` tries (atomic, so parallel guesses cannot exceed it). */
  async takeAttempt(id: string, max: number) {
    const result = await this.db.prepare('UPDATE auth_codes SET attempts=attempts+1 WHERE id=? AND attempts<? AND used_at IS NULL').bind(id, max).run()
    return (result.meta.changes ?? 0) > 0
  }
  /** Single use, even under concurrency: only the first caller changes the row. */
  async consumeCode(id: string) {
    const result = await this.db.prepare('UPDATE auth_codes SET used_at=? WHERE id=? AND used_at IS NULL').bind(now(), id).run()
    return (result.meta.changes ?? 0) > 0
  }
  deleteOldCodes(before: string) { return this.db.prepare('DELETE FROM auth_codes WHERE created_at<?').bind(before).run() }
  /** Signs the account out everywhere (after a password reset or change). */
  dropSessions(userId: string) { return this.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run() }

  /* ── server logos ──────────────────────────────────────────────────── */
  insertLogo(row: { id: string; serverId: string; userId: string; mime: string; bytes: ArrayBuffer }) {
    return this.db
      .prepare('INSERT INTO server_logos(id,server_id,uploaded_by,mime,bytes,size,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(row.id, row.serverId, row.userId, row.mime, row.bytes, row.bytes.byteLength, now())
      .run()
  }
  /** An owner has one logo waiting at a time: a new upload replaces the pending one. */
  dropPendingLogos(serverId: string) { return this.db.prepare("DELETE FROM server_logos WHERE server_id=? AND status='PENDING'").bind(serverId).run() }
  logoMeta(id: string) { return this.db.prepare('SELECT id,server_id,uploaded_by,status,mime,size,reason,reviewed_at,created_at FROM server_logos WHERE id=?').bind(id).first<Row>() }
  logoBytes(id: string) { return this.db.prepare('SELECT id,status,mime,bytes,uploaded_by FROM server_logos WHERE id=?').bind(id).first<Row>() }
  serverLogos(serverId: string) {
    return this.db.prepare('SELECT id,status,reason,reviewed_at,created_at FROM server_logos WHERE server_id=? ORDER BY created_at DESC LIMIT 10').bind(serverId).all<Row>().then(r => r.results)
  }
  async approveLogo(id: string, reviewerId: string | undefined) {
    const logo = await this.logoMeta(id)
    if (!logo) return undefined
    await this.db.batch([
      this.db.prepare("UPDATE server_logos SET status='APPROVED', reviewed_by=?, reviewed_at=?, reason=NULL WHERE id=?").bind(reviewerId ?? null, now(), id),
      // the previous approved logo stops being served; its bytes are not kept
      this.db.prepare("UPDATE server_logos SET status='REPLACED', bytes=X'' WHERE server_id=? AND status='APPROVED' AND id<>?").bind(logo.server_id, id),
      this.db.prepare('UPDATE servers SET logo_url=?, updated_at=? WHERE id=?').bind(`/api/v1/logos/${id}`, now(), logo.server_id),
    ])
    return logo
  }
  rejectLogo(id: string, reviewerId: string | undefined, reason: string) {
    // a rejected picture is not kept; the reason stays for the owner
    return this.db.prepare("UPDATE server_logos SET status='REJECTED', reviewed_by=?, reviewed_at=?, reason=?, bytes=X'' WHERE id=? AND status='PENDING'").bind(reviewerId ?? null, now(), reason, id).run()
  }

  /* ── admin queues ──────────────────────────────────────────────────── */
  async overview() {
    const row = await this.db
      .prepare(`SELECT
        (SELECT COUNT(*) FROM server_logos WHERE status='PENDING') AS pending_logos,
        (SELECT COUNT(*) FROM servers WHERE moderation='PENDING_MODERATION') AS pending_servers,
        (SELECT COUNT(*) FROM server_claims WHERE status='PENDING') AS pending_claims,
        (SELECT COUNT(*) FROM users) AS users`)
      .first<Row>()
    return { pendingLogos: Number(row?.pending_logos ?? 0), pendingServers: Number(row?.pending_servers ?? 0), pendingClaims: Number(row?.pending_claims ?? 0), users: Number(row?.users ?? 0) }
  }
  logosByStatus(status: string) {
    return this.db
      .prepare(`SELECT l.id,l.status,l.mime,l.size,l.reason,l.created_at,s.id AS server_id,s.slug AS server_slug,s.name AS server_name,s.game_id AS server_game,
        u.id AS user_id,u.display_name AS user_name,u.email AS user_email
        FROM server_logos l JOIN servers s ON s.id=l.server_id LEFT JOIN users u ON u.id=l.uploaded_by
        WHERE l.status=? ORDER BY l.created_at LIMIT 100`)
      .bind(status)
      .all<Row>()
      .then(r => r.results)
  }
  claimsByStatus(status: string) {
    return this.db
      .prepare(`SELECT c.id,c.status,c.method,c.created_at,s.id AS server_id,s.slug AS server_slug,s.name AS server_name,
        u.id AS user_id,u.display_name AS user_name,u.email AS user_email
        FROM server_claims c JOIN servers s ON s.id=c.server_id JOIN users u ON u.id=c.user_id
        WHERE c.status=? ORDER BY c.created_at DESC LIMIT 100`)
      .bind(status)
      .all<Row>()
      .then(r => r.results)
  }
  submitters(ids: string[]) {
    if (!ids.length) return Promise.resolve([] as Row[])
    return this.db.prepare(`SELECT id,display_name,email FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<Row>().then(r => r.results)
  }
  /** Submitted cards by moderation state, newest first, with who sent them. */
  serversByModeration(moderation: string) {
    return this.db
      .prepare(`SELECT s.*, u.display_name AS submitter_name, u.email AS submitter_email FROM servers s LEFT JOIN users u ON u.id=s.submitted_by
        WHERE s.moderation=? ORDER BY s.added_at DESC LIMIT 100`)
      .bind(moderation)
      .all<Row>()
      .then(r => r.results)
  }
  rejectServer(id: string, reason: string) {
    return this.db.prepare("UPDATE servers SET moderation='REJECTED', moderation_note=?, updated_at=? WHERE id=?").bind(reason, now(), id).run()
  }
  users(query: string) {
    const q = `%${query.trim().toLowerCase()}%`
    return this.db
      .prepare(`SELECT id,display_name,email,roles,created_at,last_login_at,banned_at,email_verified_at FROM users
        WHERE ?='%%' OR lower(display_name) LIKE ? OR lower(COALESCE(email,'')) LIKE ? OR id=?
        ORDER BY created_at DESC LIMIT 100`)
      .bind(q, q, q, query.trim())
      .all<Row>()
      .then(r => r.results)
  }
  identitiesOf(userIds: string[]) {
    if (!userIds.length) return Promise.resolve([] as Row[])
    return this.db.prepare(`SELECT user_id,provider,created_at FROM user_identities WHERE user_id IN (${userIds.map(() => '?').join(',')})`).bind(...userIds).all<Row>().then(r => r.results)
  }
}
