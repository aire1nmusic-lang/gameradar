/**
 * Reference implementation of the accounts store contract (see app.mjs). Single-threaded, so each async method
 * is atomic. Used by tests and by a local run; production uses store-ydb.mjs with the same observable behaviour.
 */
export function memoryStore() {
  const users = new Map(), byEmail = new Map(), sessions = new Map(), tokens = new Map(), slots = new Map(), rates = new Map()
  const identities = new Map(), states = new Map()
  const audit = []
  const live = (row, now) => row.expiresAt > now
  const dropSession = hash => { const s = sessions.get(hash); if (s) { sessions.delete(hash) } }
  const record = (actorId, action, target, now) => audit.push({ actorId, action, target, createdAt: now })
  return {
    // inspection helpers for tests only
    _state: { users, sessions, tokens, rates, audit, identities, states },
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
    async identitiesOf(userId) {
      return [...identities.entries()].filter(([, row]) => row.userId === userId)
        .map(([key, row]) => ({ provider: key.split('|')[0], linkedAt: row.createdAt, emailVerified: !!row.emailVerified }))
    },
    async saveOAuthState({ stateHash, browserHash, provider, verifier, nextPath, expiresAt }) {
      states.set(stateHash, { browserHash, provider, verifier, nextPath, expiresAt })
    },
    async takeOAuthState({ stateHash, browserHash, provider, now }) {
      const row = states.get(stateHash)
      if (!row || row.browserHash !== browserHash || row.provider !== provider || !live(row, now)) return null
      states.delete(stateHash)
      return { verifier: row.verifier, nextPath: row.nextPath }
    },
    async oauthSignIn({ provider, subject, displayName, newUserId, allowCreate, sessionHash, replaceSessionHash, sessionExpiresAt, now, grantAdmin, emailVerified }) {
      const key = `${provider}|${subject}`
      let userId = identities.get(key)?.userId
      if (!userId) {
        if (!allowCreate) return { status: 'closed' }
        userId = newUserId
        users.set(userId, { id: userId, email: null, displayName, passwordHash: null, emailVerifiedAt: null, bannedAt: null, createdAt: now, roles: ['PLAYER'] })
        identities.set(key, { userId, createdAt: now })
      }
      const user = users.get(userId)
      if (user.bannedAt) return { status: 'banned' }
      identities.get(key).emailVerified = !!emailVerified
      if (grantAdmin && !user.roles.includes('ADMIN')) { user.roles = ['PLAYER', 'ADMIN']; record(userId, 'role.admin', provider, now) }
      record(userId, 'identity.login', provider, now)
      dropSession(replaceSessionHash)
      sessions.set(sessionHash, { userId, createdAt: now, expiresAt: sessionExpiresAt, loginMethod: provider })
      return { status: 'ok', user: { ...user, loginMethod: provider } }
    },
  }
}
