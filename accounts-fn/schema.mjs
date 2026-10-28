/**
 * YDB (YQL) schema of the accounts service. Uniqueness is expressed with primary keys only
 * (gs_user_emails.email, gs_token_slots.email+purpose) so no secondary-index feature is required.
 * Short-lived rows carry a TTL column; TTL deletion is asynchronous, so every read still filters expires_at.
 * Applied explicitly by `node accounts-fn/migrate.mjs` — never implicitly by the function.
 */
const TTL = 'WITH (TTL = Interval("PT0S") ON expires_at)'

export const statements = [
  ['gs_users', `CREATE TABLE gs_users (
    id Utf8, email Utf8, display_name Utf8, password_hash Utf8,
    email_verified_at Timestamp, banned_at Timestamp, created_at Timestamp, roles Utf8,
    PRIMARY KEY (id))`],
  ['gs_user_emails', `CREATE TABLE gs_user_emails (email Utf8, user_id Utf8, PRIMARY KEY (email))`],
  ['gs_sessions', `CREATE TABLE gs_sessions (
    token_hash Utf8, user_id Utf8, created_at Timestamp, expires_at Timestamp, login_method Utf8,
    PRIMARY KEY (token_hash)) ${TTL}`],
  ['gs_user_sessions', `CREATE TABLE gs_user_sessions (
    user_id Utf8, token_hash Utf8, expires_at Timestamp,
    PRIMARY KEY (user_id, token_hash)) ${TTL}`],
  ['gs_tokens', `CREATE TABLE gs_tokens (
    token_hash Utf8, email Utf8, purpose Utf8, payload Utf8, created_at Timestamp, expires_at Timestamp,
    PRIMARY KEY (token_hash)) ${TTL}`],
  ['gs_token_slots', `CREATE TABLE gs_token_slots (
    email Utf8, purpose Utf8, token_hash Utf8, expires_at Timestamp,
    PRIMARY KEY (email, purpose)) ${TTL}`],
  ['gs_rate_limits', `CREATE TABLE gs_rate_limits (
    rate_key Utf8, bucket_window Int32, hits Int32, expires_at Timestamp,
    PRIMARY KEY (rate_key, bucket_window)) ${TTL}`],
  ['gs_audit', `CREATE TABLE gs_audit (
    audit_id Utf8, actor_id Utf8, audit_action Utf8, audit_target Utf8, created_at Timestamp,
    PRIMARY KEY (audit_id))`],
]
