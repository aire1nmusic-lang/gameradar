/**
 * Reference implementation of the accounts store contract (see app.mjs). Single-threaded, so each async method
 * is atomic. Used by tests and by a local run; production uses store-ydb.mjs with the same observable behaviour.
 */
export function memoryStore() {
  const users = new Map(), byEmail = new Map(), sessions = new Map(), tokens = new Map(), slots = new Map(), rates = new Map()
  const audit = []
  const live = (row, now) => row.expiresAt > now
  const dropSession = hash => { const s = sessions.get(hash); if (s) { sessions.delete(hash) } }
  const record = (actorId, action, target, now) => audit.push({ actorId, action, target, createdAt: now })
  return {
    // inspection helpers for tests only
    _state: { users, sessions, tokens, rates, audit },
    async ping() { return true },
    async rateHit({ key, window, expiresAt }) {
      const id = `${key}:${window}`
      const row = rates.get(id) ?? { count: 0, expiresAt }
      row.count += 1
      rates.set(id, row)
      return row.count
    },
    async userByEmail(email) { return users.get(byEmail.get(email)) ?? null },
    async userById(id) { return users.get(id) ?? null },
    async sessionUser({ tokenHash, now }) {
      const session = sessions.get(tokenHash)
      if (!session || !live(session, now)) return null
      const user = users.get(session.userId)
      if (!user || user.bannedAt) return null
      return { user: { ...user, loginMethod: session.loginMethod }, session }
    },
    async issueToken({ email, purpose, tokenHash, payload, expiresAt, now, onlyIfNoUser }) {
      if (onlyIfNoUser && byEmail.has(email)) return false
      const slot = `${email}\n${purpose}`
      const previous = slots.get(slot)
      if (previous) tokens.delete(previous)
      tokens.set(tokenHash, { email, purpose, payload, expiresAt, createdAt: now })
      slots.set(slot, tokenHash)
      return true
    },
    async confirmRegistration({ tokenHash, userId, sessionHash, replaceSessionHash, sessionExpiresAt, now }) {
      const row = tokens.get(tokenHash)
      if (!row || row.purpose !== 'REGISTER' || !live(row, now)) return null
      if (byEmail.has(row.email)) return null
      tokens.delete(tokenHash); slots.delete(`${row.email}\nREGISTER`)
      const user = { id: userId, email: row.email, displayName: row.payload.name, passwordHash: row.payload.hash,
        emailVerifiedAt: now, bannedAt: null, createdAt: now, roles: ['PLAYER'] }
      users.set(userId, user); byEmail.set(row.email, userId)
      record(userId, 'account.verified', userId, now)
      dropSession(replaceSessionHash)
      sessions.set(sessionHash, { userId, createdAt: now, expiresAt: sessionExpiresAt, loginMethod: 'email' })
      return user
    },
    async openSession({ userId, expectedPasswordHash, sessionHash, replaceSessionHash, sessionExpiresAt, loginMethod, now }) {
      const user = users.get(userId)
      if (!user || user.bannedAt || user.passwordHash !== expectedPasswordHash) return false
      dropSession(replaceSessionHash)
      sessions.set(sessionHash, { userId, createdAt: now, expiresAt: sessionExpiresAt, loginMethod })
      return true
    },
    async resetPassword({ tokenHash, passwordHash, now }) {
      const row = tokens.get(tokenHash)
      if (!row || row.purpose !== 'RESET' || !live(row, now)) return false
      const user = users.get(row.payload.userId)
      if (!user || user.bannedAt || user.email !== row.email) return false
      tokens.delete(tokenHash); slots.delete(`${row.email}\nRESET`)
      user.passwordHash = passwordHash
      for (const [hash, session] of sessions) if (session.userId === user.id) sessions.delete(hash)
      record(user.id, 'password.reset', user.id, now)
      return true
    },
    async deleteSession(tokenHash) { dropSession(tokenHash) },
  }
}
