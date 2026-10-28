-- Free-plan accounts (accounts-fn/store-d1.mjs): e-mail link registration, sessions, recovery.
-- New tables only; the legacy users/sessions/auth_codes tables are left untouched.
-- Raw tokens and passwords are never stored: only SHA-256 of tokens and PBKDF2+pepper hashes.
-- Times are ISO-8601 UTC strings (lexicographic order = time order).

CREATE TABLE acc_users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  display_name       TEXT NOT NULL,
  password_hash      TEXT NOT NULL,
  email_verified_at  TEXT,
  banned_at          TEXT,
  created_at         TEXT NOT NULL,
  roles              TEXT NOT NULL DEFAULT '["PLAYER"]'
);

CREATE TABLE acc_sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES acc_users(id),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  login_method  TEXT NOT NULL
);
CREATE INDEX idx_acc_sessions_user ON acc_sessions(user_id);
CREATE INDEX idx_acc_sessions_expires ON acc_sessions(expires_at);

-- One live link per address and purpose; a newer link replaces the older one.
CREATE TABLE acc_tokens (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  UNIQUE (email, purpose)
);
CREATE INDEX idx_acc_tokens_expires ON acc_tokens(expires_at);

CREATE TABLE acc_rate (
  rate_key       TEXT NOT NULL,
  bucket_window  INTEGER NOT NULL,
  hits           INTEGER NOT NULL,
  expires_at     TEXT NOT NULL,
  PRIMARY KEY (rate_key, bucket_window)
);
CREATE INDEX idx_acc_rate_expires ON acc_rate(expires_at);

CREATE TABLE acc_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  target      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Daily cap on account operations, so the free D1/Workers quotas shared with the catalog are never exhausted.
CREATE TABLE acc_daily (
  day    TEXT PRIMARY KEY,
  calls  INTEGER NOT NULL
);
