/**
 * Accounts store on Cloudflare D1 (SQLite), free plan. Schema: migrations/0012_free_accounts.sql.
 * D1 has no interactive transactions, so every multi-step operation is one atomic `batch()` whose statements are
 * guarded by the same condition (EXISTS …): either all of them take effect or none does, and D1 runs batches one
 * after another, so two simultaneous confirmations of one link cannot both succeed (and UNIQUE(email) backs it up).
 */
const iso = date => date.toISOString()
const date = value => value ? new Date(value) : null
const userOf = row => row && ({ id: row.id, email: row.email, displayName: row.display_name, passwordHash: row.password_hash,
  emailVerifiedAt: date(row.email_verified_at), bannedAt: date(row.banned_at), createdAt: date(row.created_at),
  roles: JSON.parse(row.roles || '["PLAYER"]') })

export function d1Store(db) {
  const one = (sql, ...args) => db.prepare(sql).bind(...args).first()
  const changes = result => Number(result?.meta?.changes ?? 0)
  return {
    async ping() { await one('SELECT 1 AS ok'); return true },

    async rateHit({ key, window, expiresAt }) {
      const row = await one(`INSERT INTO acc_rate (rate_key, bucket_window, hits, expires_at) VALUES (?, ?, 1, ?)
        ON CONFLICT (rate_key, bucket_window) DO UPDATE SET hits = hits + 1 RETURNING hits`, key, window, iso(expiresAt))
      return Number(row.hits)
    },

    /** Operations already counted for the UTC day (a read: once the cap is reached nothing more is written). */
    async dailyCount(day) {
      return Number((await one('SELECT calls FROM acc_daily WHERE day = ?', day))?.calls ?? 0)
    },

    /** Counts one account operation for the UTC day; returns the new count. */
    async dailyHit(day) {
      const row = await one(`INSERT INTO acc_daily (day, calls) VALUES (?, 1)
        ON CONFLICT (day) DO UPDATE SET calls = calls + 1 RETURNING calls`, day)
      return Number(row.calls)
    },

    async userByEmail(email) { return userOf(await one('SELECT * FROM acc_users WHERE email = ?', email)) },
    async userById(id) { return userOf(await one('SELECT * FROM acc_users WHERE id = ?', id)) },

    async sessionUser({ tokenHash, now }) {
      const row = await one(`SELECT u.*, s.created_at AS session_created_at, s.expires_at AS session_expires_at, s.login_method
        FROM acc_sessions s JOIN acc_users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned_at IS NULL`, tokenHash, iso(now))
      if (!row) return null
      return { user: { ...userOf(row), loginMethod: row.login_method },
        session: { createdAt: date(row.session_created_at), expiresAt: date(row.session_expires_at), loginMethod: row.login_method } }
    },

    async issueToken({ email, purpose, tokenHash, payload, expiresAt, now, onlyIfNoUser }) {
      const guard = onlyIfNoUser ? 'NOT EXISTS (SELECT 1 FROM acc_users WHERE email = ?)' : '? IS NOT NULL'
      const result = await db.prepare(`INSERT INTO acc_tokens (token_hash, email, purpose, payload, created_at, expires_at)
        SELECT ?, ?, ?, ?, ?, ? WHERE ${guard}
        ON CONFLICT (email, purpose) DO UPDATE SET token_hash = excluded.token_hash, payload = excluded.payload,
          created_at = excluded.created_at, expires_at = excluded.expires_at`)
        .bind(tokenHash, email, purpose, JSON.stringify(payload), iso(now), iso(expiresAt), email).run()
      return changes(result) > 0
    },

    async confirmRegistration({ tokenHash, userId, sessionHash, replaceSessionHash, sessionExpiresAt, now }) {
      const row = await one(`SELECT email, payload FROM acc_tokens WHERE token_hash = ? AND purpose = 'REGISTER' AND expires_at > ?`, tokenHash, iso(now))
      if (!row) return null
      const payload = JSON.parse(row.payload), at = iso(now)
      const valid = `EXISTS (SELECT 1 FROM acc_tokens WHERE token_hash = ? AND purpose = 'REGISTER' AND expires_at > ?)`
      const created = 'EXISTS (SELECT 1 FROM acc_users WHERE id = ?)'
      const results = await db.batch([
        db.prepare(`INSERT INTO acc_users (id, email, display_name, password_hash, email_verified_at, created_at)
          SELECT ?, ?, ?, ?, ?, ? WHERE ${valid} AND NOT EXISTS (SELECT 1 FROM acc_users WHERE email = ?)`)
          .bind(userId, row.email, payload.name, payload.hash, at, at, tokenHash, at, row.email),
        db.prepare(`INSERT INTO acc_audit (actor_id, action, target, created_at) SELECT ?, 'account.verified', ?, ? WHERE ${created}`)
          .bind(userId, userId, at, userId),
        db.prepare(`DELETE FROM acc_sessions WHERE token_hash = ? AND ${created}`).bind(replaceSessionHash, userId),
        db.prepare(`INSERT INTO acc_sessions (token_hash, user_id, created_at, expires_at, login_method)
          SELECT ?, ?, ?, ?, 'email' WHERE ${created}`).bind(sessionHash, userId, at, iso(sessionExpiresAt), userId),
        db.prepare(`DELETE FROM acc_tokens WHERE token_hash = ? AND ${created}`).bind(tokenHash, userId),
      ])
      if (!changes(results[0])) return null
      return { id: userId, email: row.email, displayName: payload.name, passwordHash: payload.hash, emailVerifiedAt: now,
        bannedAt: null, createdAt: now, roles: ['PLAYER'] }
    },

    async openSession({ userId, expectedPasswordHash, sessionHash, replaceSessionHash, sessionExpiresAt, loginMethod, now }) {
      const ok = 'EXISTS (SELECT 1 FROM acc_users WHERE id = ? AND banned_at IS NULL AND password_hash = ?)'
      const results = await db.batch([
        db.prepare(`DELETE FROM acc_sessions WHERE token_hash = ? AND ${ok}`).bind(replaceSessionHash, userId, expectedPasswordHash),
        db.prepare(`INSERT INTO acc_sessions (token_hash, user_id, created_at, expires_at, login_method)
          SELECT ?, ?, ?, ?, ? WHERE ${ok}`).bind(sessionHash, userId, iso(now), iso(sessionExpiresAt), loginMethod, userId, expectedPasswordHash),
      ])
      return changes(results[1]) > 0
    },

    async resetPassword({ tokenHash, passwordHash, now }) {
      const row = await one(`SELECT t.email, t.payload FROM acc_tokens t WHERE t.token_hash = ? AND t.purpose = 'RESET' AND t.expires_at > ?`, tokenHash, iso(now))
      if (!row) return false
      const userId = JSON.parse(row.payload).userId, at = iso(now)
      // The link must still be live and belong to this not-banned account with the same address.
      const valid = `EXISTS (SELECT 1 FROM acc_tokens t JOIN acc_users u ON u.id = ? AND u.email = t.email AND u.banned_at IS NULL
        WHERE t.token_hash = ? AND t.purpose = 'RESET' AND t.expires_at > ?)`
      const v = [userId, tokenHash, at]
      const results = await db.batch([
        db.prepare(`UPDATE acc_users SET password_hash = ? WHERE id = ? AND ${valid}`).bind(passwordHash, userId, ...v),
        db.prepare(`DELETE FROM acc_sessions WHERE user_id = ? AND ${valid}`).bind(userId, ...v),
        db.prepare(`INSERT INTO acc_audit (actor_id, action, target, created_at) SELECT ?, 'password.reset', ?, ? WHERE ${valid}`).bind(userId, userId, at, ...v),
        db.prepare(`DELETE FROM acc_tokens WHERE token_hash = ? AND ${valid}`).bind(tokenHash, ...v),
      ])
      return changes(results[0]) > 0
    },

    async identitiesOf(userId) {
      const { results } = await db.prepare('SELECT provider, created_at FROM acc_identities WHERE user_id = ? ORDER BY provider').bind(userId).all()
      return results.map(row => ({ provider: row.provider, linkedAt: date(row.created_at) }))
    },

    async saveOAuthState({ stateHash, browserHash, provider, verifier, nextPath, expiresAt }) {
      await db.prepare(`INSERT INTO acc_oauth_states (state_hash, browser_hash, provider, verifier, next_path, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(stateHash, browserHash, provider, verifier, nextPath, iso(expiresAt)).run()
    },

    /** One use: the row is deleted in the same statement that reads it. */
    async takeOAuthState({ stateHash, browserHash, provider, now }) {
      const row = await one(`DELETE FROM acc_oauth_states WHERE state_hash = ? AND browser_hash = ? AND provider = ? AND expires_at > ?
        RETURNING verifier, next_path`, stateHash, browserHash, provider, iso(now))
      return row ? { verifier: row.verifier, nextPath: row.next_path } : null
    },

    async oauthSignIn(args, retry = true) {
      const { provider, subject, displayName, verifiedEmail, newUserId, allowCreate, sessionHash, replaceSessionHash, sessionExpiresAt, now } = args
      const at = iso(now)
      const identity = await one('SELECT user_id FROM acc_identities WHERE provider = ? AND subject = ?', provider, subject)
      const userId = identity?.user_id ?? newUserId
      if (!identity && !allowCreate) return { status: 'closed' }
      const statements = []
      if (!identity) statements.push(
        db.prepare(`INSERT INTO acc_users (id, email, display_name, password_hash, created_at) VALUES (?, NULL, ?, NULL, ?)`).bind(userId, displayName, at),
        db.prepare(`INSERT INTO acc_identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)`).bind(provider, subject, userId, at))
      const ok = 'EXISTS (SELECT 1 FROM acc_users WHERE id = ? AND banned_at IS NULL)'
      if (verifiedEmail) statements.push(db.prepare(`UPDATE acc_users SET email = ?, email_verified_at = ?
        WHERE id = ? AND email IS NULL AND banned_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM acc_users WHERE email = ?)`)
        .bind(verifiedEmail, at, userId, verifiedEmail))
      statements.push(
        db.prepare(`INSERT INTO acc_audit (actor_id, action, target, created_at) SELECT ?, 'identity.login', ?, ? WHERE ${ok}`).bind(userId, provider, at, userId),
        db.prepare(`DELETE FROM acc_sessions WHERE token_hash = ? AND ${ok}`).bind(replaceSessionHash, userId),
        db.prepare(`INSERT INTO acc_sessions (token_hash, user_id, created_at, expires_at, login_method) SELECT ?, ?, ?, ?, ? WHERE ${ok}`)
          .bind(sessionHash, userId, at, iso(sessionExpiresAt), provider, userId))
      let results
      try { results = await db.batch(statements) }
      catch (error) {
        // A simultaneous first sign-in with the same identity won the race: sign in to that account instead.
        if (retry && !identity) return this.oauthSignIn(args, false)
        throw error
      }
      if (!changes(results.at(-1))) return { status: 'banned' }
      const user = await this.userById(userId)
      return { status: 'ok', user: { ...user, loginMethod: provider } }
    },

    async deleteSession(tokenHash) { await db.prepare('DELETE FROM acc_sessions WHERE token_hash = ?').bind(tokenHash).run() },

    /** Removes expired links, sessions and counters; called from the Worker's cron at most once an hour. */
    async cleanup(now) {
      const at = iso(now)
      await db.batch([
        db.prepare('DELETE FROM acc_tokens WHERE expires_at <= ?').bind(at),
        db.prepare('DELETE FROM acc_sessions WHERE expires_at <= ?').bind(at),
        db.prepare('DELETE FROM acc_rate WHERE expires_at <= ?').bind(at),
        db.prepare('DELETE FROM acc_daily WHERE day < ?').bind(at.slice(0, 10)),
        db.prepare('DELETE FROM acc_oauth_states WHERE expires_at <= ?').bind(at),
      ])
    },
  }
}
