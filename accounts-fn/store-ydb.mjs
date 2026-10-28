import { randomBytes } from 'node:crypto'
import { Driver, TypedData, TypedValues, Types, getCredentialsFromEnv } from 'ydb-sdk'

/**
 * Production store: serverless YDB through the classic Table API of ydb-sdk 5.x.
 * Every public method is one interactive serializable transaction run inside `withSessionRetry`, so a lost
 * race (ABORTED / transaction locks invalidated) is replayed from the start and observes the winner.
 * Schema: schema.mjs. STATUS: not yet executed against a real YDB (HYPOTHESIS) — see docs/runbooks/free-account-hosting.md.
 */
const READ_WRITE = { serializableReadWrite: {} }
const AUTO_TX = { beginTx: READ_WRITE, commitTx: true }

const text = value => TypedValues.utf8(String(value))
const stamp = value => value ? TypedValues.timestamp(value) : TypedValues.optionalNull(Types.TIMESTAMP)
const rowsOf = resultSet => resultSet ? TypedData.createNativeObjects(resultSet).map(row => ({ ...row })) : []
const date = value => value instanceof Date ? value : value ? new Date(value) : null
const userOf = row => row && ({ id: row.id, email: row.email, displayName: row.display_name, passwordHash: row.password_hash,
  emailVerifiedAt: date(row.email_verified_at), bannedAt: date(row.banned_at), createdAt: date(row.created_at),
  roles: JSON.parse(row.roles || '["PLAYER"]') })
const USER_COLUMNS = `u.id AS id, u.email AS email, u.display_name AS display_name, u.password_hash AS password_hash,
  u.email_verified_at AS email_verified_at, u.banned_at AS banned_at, u.created_at AS created_at, u.roles AS roles`

export async function createYdbStore({ driver, retries = 5, timeoutMs = 10_000 } = {}) {
  if (!driver) {
    const endpoint = process.env.YDB_ENDPOINT, database = process.env.YDB_DATABASE
    if (!endpoint || !database) throw new Error('YDB_ENDPOINT_and_YDB_DATABASE_required')
    // In a function with a service account set YDB_METADATA_CREDENTIALS=1 (metadata-service token).
    driver = new Driver({ connectionString: `${endpoint}?database=${encodeURIComponent(database)}`, authService: getCredentialsFromEnv() })
    if (!await driver.ready(timeoutMs)) throw new Error('ydb_driver_not_ready')
  }

  /** One transaction: `fn(run)` where run(yql, params) -> array of row arrays (one per result set). */
  const transaction = fn => driver.tableClient.withSessionRetry(async session => {
    const { id } = await session.beginTransaction(READ_WRITE)
    const tx = { txId: id }
    const run = async (yql, params = {}) => (await session.executeQuery(yql, params, tx)).resultSets.map(rowsOf)
    try {
      const result = await fn(run)
      await session.commitTransaction(tx)
      return result
    } catch (error) {
      try { await session.rollbackTransaction(tx) } catch { /* the transaction is already gone (ABORTED) */ }
      throw error
    }
  }, timeoutMs, retries)

  const audit = (run, actorId, action, target, now) => run(`
    DECLARE $id AS Utf8; DECLARE $actor AS Utf8; DECLARE $action AS Utf8; DECLARE $target AS Utf8; DECLARE $at AS Timestamp;
    UPSERT INTO gs_audit (audit_id, actor_id, audit_action, audit_target, created_at) VALUES ($id, $actor, $action, $target, $at);`,
  { $id: text(`${now.toISOString()}-${randomBytes(6).toString('hex')}`), $actor: text(actorId), $action: text(action), $target: text(target), $at: stamp(now) })

  /** Removes a session and its per-user index row; a missing session is not an error. */
  const dropSession = async (run, tokenHash) => {
    const [[row]] = await run('DECLARE $h AS Utf8; SELECT user_id FROM gs_sessions WHERE token_hash = $h;', { $h: text(tokenHash) })
    if (!row) return
    await run(`DECLARE $h AS Utf8; DECLARE $u AS Utf8;
      DELETE FROM gs_sessions WHERE token_hash = $h; DELETE FROM gs_user_sessions WHERE user_id = $u AND token_hash = $h;`,
    { $h: text(tokenHash), $u: text(row.user_id) })
  }
  const addSession = (run, { userId, tokenHash, now, expiresAt, loginMethod }) => run(`
    DECLARE $h AS Utf8; DECLARE $u AS Utf8; DECLARE $at AS Timestamp; DECLARE $exp AS Timestamp; DECLARE $m AS Utf8;
    UPSERT INTO gs_sessions (token_hash, user_id, created_at, expires_at, login_method) VALUES ($h, $u, $at, $exp, $m);
    UPSERT INTO gs_user_sessions (user_id, token_hash, expires_at) VALUES ($u, $h, $exp);`,
  { $h: text(tokenHash), $u: text(userId), $at: stamp(now), $exp: stamp(expiresAt), $m: text(loginMethod) })
  const tokenRow = async (run, tokenHash, purpose, now) => {
    const [[row]] = await run(`DECLARE $h AS Utf8; DECLARE $p AS Utf8;
      SELECT email, purpose, payload, expires_at FROM gs_tokens WHERE token_hash = $h AND purpose = $p;`,
    { $h: text(tokenHash), $p: text(purpose) })
    return row && date(row.expires_at) > now ? { email: row.email, payload: JSON.parse(row.payload) } : null
  }
  const consumeToken = (run, tokenHash, email, purpose) => run(`DECLARE $h AS Utf8; DECLARE $e AS Utf8; DECLARE $p AS Utf8;
    DELETE FROM gs_tokens WHERE token_hash = $h; DELETE FROM gs_token_slots WHERE email = $e AND purpose = $p;`,
  { $h: text(tokenHash), $e: text(email), $p: text(purpose) })

  return {
    async ping() {
      await driver.tableClient.withSessionRetry(session => session.executeQuery('SELECT 1 AS ok;', {}, AUTO_TX), timeoutMs, 2)
      return true
    },
    rateHit: ({ key, window, expiresAt }) => transaction(async run => {
      const [[row]] = await run('DECLARE $k AS Utf8; DECLARE $w AS Int32; SELECT hits FROM gs_rate_limits WHERE rate_key = $k AND bucket_window = $w;',
        { $k: text(key), $w: TypedValues.int32(window) })
      const hits = (row?.hits ?? 0) + 1
      await run(`DECLARE $k AS Utf8; DECLARE $w AS Int32; DECLARE $n AS Int32; DECLARE $exp AS Timestamp;
        UPSERT INTO gs_rate_limits (rate_key, bucket_window, hits, expires_at) VALUES ($k, $w, $n, $exp);`,
      { $k: text(key), $w: TypedValues.int32(window), $n: TypedValues.int32(hits), $exp: stamp(expiresAt) })
      return hits
    }),
    async userByEmail(email) {
      return transaction(async run => userOf((await run(`DECLARE $e AS Utf8;
        SELECT ${USER_COLUMNS} FROM gs_user_emails AS m INNER JOIN gs_users AS u ON u.id = m.user_id WHERE m.email = $e;`,
      { $e: text(email) }))[0][0]))
    },
    async userById(id) {
      return transaction(async run => userOf((await run(`DECLARE $i AS Utf8; SELECT ${USER_COLUMNS} FROM gs_users AS u WHERE u.id = $i;`,
        { $i: text(id) }))[0][0]))
    },
    async sessionUser({ tokenHash, now }) {
      return transaction(async run => {
        const [[row]] = await run(`DECLARE $h AS Utf8; DECLARE $now AS Timestamp;
          SELECT s.created_at AS session_created_at, s.expires_at AS session_expires_at, s.login_method AS login_method, ${USER_COLUMNS}
          FROM gs_sessions AS s INNER JOIN gs_users AS u ON u.id = s.user_id
          WHERE s.token_hash = $h AND s.expires_at > $now AND u.banned_at IS NULL;`,
        { $h: text(tokenHash), $now: stamp(now) })
        return row ? { user: { ...userOf(row), loginMethod: row.login_method },
          session: { createdAt: date(row.session_created_at), expiresAt: date(row.session_expires_at), loginMethod: row.login_method } } : null
      })
    },
    issueToken: ({ email, purpose, tokenHash, payload, expiresAt, now, onlyIfNoUser }) => transaction(async run => {
      if (onlyIfNoUser && (await run('DECLARE $e AS Utf8; SELECT user_id FROM gs_user_emails WHERE email = $e;', { $e: text(email) }))[0].length) return false
      const [[old]] = await run('DECLARE $e AS Utf8; DECLARE $p AS Utf8; SELECT token_hash FROM gs_token_slots WHERE email = $e AND purpose = $p;',
        { $e: text(email), $p: text(purpose) })
      if (old) await run('DECLARE $h AS Utf8; DELETE FROM gs_tokens WHERE token_hash = $h;', { $h: text(old.token_hash) })
      await run(`DECLARE $h AS Utf8; DECLARE $e AS Utf8; DECLARE $p AS Utf8; DECLARE $j AS Utf8; DECLARE $at AS Timestamp; DECLARE $exp AS Timestamp;
        UPSERT INTO gs_tokens (token_hash, email, purpose, payload, created_at, expires_at) VALUES ($h, $e, $p, $j, $at, $exp);
        UPSERT INTO gs_token_slots (email, purpose, token_hash, expires_at) VALUES ($e, $p, $h, $exp);`,
      { $h: text(tokenHash), $e: text(email), $p: text(purpose), $j: text(JSON.stringify(payload)), $at: stamp(now), $exp: stamp(expiresAt) })
      return true
    }),
    confirmRegistration: ({ tokenHash, userId, sessionHash, replaceSessionHash, sessionExpiresAt, now }) => transaction(async run => {
      const row = await tokenRow(run, tokenHash, 'REGISTER', now)
      if (!row) return null
      if ((await run('DECLARE $e AS Utf8; SELECT user_id FROM gs_user_emails WHERE email = $e;', { $e: text(row.email) }))[0].length) return null
      await consumeToken(run, tokenHash, row.email, 'REGISTER')
      await run(`DECLARE $i AS Utf8; DECLARE $e AS Utf8; DECLARE $n AS Utf8; DECLARE $p AS Utf8; DECLARE $at AS Timestamp; DECLARE $r AS Utf8;
        UPSERT INTO gs_users (id, email, display_name, password_hash, email_verified_at, banned_at, created_at, roles)
          VALUES ($i, $e, $n, $p, $at, NULL, $at, $r);
        UPSERT INTO gs_user_emails (email, user_id) VALUES ($e, $i);`,
      { $i: text(userId), $e: text(row.email), $n: text(row.payload.name), $p: text(row.payload.hash), $at: stamp(now), $r: text('["PLAYER"]') })
      await audit(run, userId, 'account.verified', userId, now)
      await dropSession(run, replaceSessionHash)
      await addSession(run, { userId, tokenHash: sessionHash, now, expiresAt: sessionExpiresAt, loginMethod: 'email' })
      return { id: userId, email: row.email, displayName: row.payload.name, passwordHash: row.payload.hash, emailVerifiedAt: now,
        bannedAt: null, createdAt: now, roles: ['PLAYER'] }
    }),
    openSession: ({ userId, expectedPasswordHash, sessionHash, replaceSessionHash, sessionExpiresAt, loginMethod, now }) => transaction(async run => {
      const [[row]] = await run(`DECLARE $i AS Utf8; SELECT ${USER_COLUMNS} FROM gs_users AS u WHERE u.id = $i;`, { $i: text(userId) })
      const user = userOf(row)
      if (!user || user.bannedAt || user.passwordHash !== expectedPasswordHash) return false
      await dropSession(run, replaceSessionHash)
      await addSession(run, { userId, tokenHash: sessionHash, now, expiresAt: sessionExpiresAt, loginMethod })
      return true
    }),
    resetPassword: ({ tokenHash, passwordHash, now }) => transaction(async run => {
      const row = await tokenRow(run, tokenHash, 'RESET', now)
      if (!row) return false
      const [[found]] = await run(`DECLARE $i AS Utf8; SELECT ${USER_COLUMNS} FROM gs_users AS u WHERE u.id = $i;`, { $i: text(row.payload.userId) })
      const user = userOf(found)
      if (!user || user.bannedAt || user.email !== row.email) return false
      await consumeToken(run, tokenHash, row.email, 'RESET')
      await run('DECLARE $i AS Utf8; DECLARE $p AS Utf8; UPDATE gs_users SET password_hash = $p WHERE id = $i;', { $i: text(user.id), $p: text(passwordHash) })
      const [sessions] = await run('DECLARE $u AS Utf8; SELECT token_hash FROM gs_user_sessions WHERE user_id = $u LIMIT 200;', { $u: text(user.id) })
      for (const { token_hash: hash } of sessions) await dropSession(run, hash)
      await audit(run, user.id, 'password.reset', user.id, now)
      return true
    }),
    deleteSession: tokenHash => transaction(run => dropSession(run, tokenHash)),
  }
}
