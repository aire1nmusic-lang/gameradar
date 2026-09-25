-- Accounts: email + password with emailed confirmation codes, several sign-in
-- providers per person, roles for the admin panel, and server logos that an
-- admin approves before they appear on the site.

-- users: a password (PBKDF2 + server pepper, never plain), when the email was
-- confirmed, the last sign-in, and a ban flag. Legacy columns provider /
-- provider_id stay for the first provider; user_identities is the source of truth.
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN banned_at TEXT;

-- One row per external account (Google, Yandex, VK, Discord) linked to a user.
CREATE TABLE user_identities (
  provider     TEXT NOT NULL,
  provider_id  TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email        TEXT,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (provider, provider_id)
);
CREATE INDEX idx_identities_user ON user_identities(user_id);

-- Existing Discord users keep signing in to the same account.
INSERT INTO user_identities(provider, provider_id, user_id, created_at)
  SELECT lower(provider), provider_id, id, created_at FROM users
  WHERE provider_id IS NOT NULL AND provider <> 'EMAIL';

-- Emailed one-time codes: registration, sign-in by code, password reset.
-- Only a hash of the code is stored; payload carries a pending registration
-- (display name and password hash) until the code is confirmed.
CREATE TABLE auth_codes (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL,           -- REGISTER | LOGIN | RESET
  code_hash   TEXT NOT NULL,
  payload     TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used_at     TEXT,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  ip_hash     TEXT
);
CREATE INDEX idx_auth_codes_email ON auth_codes(email, purpose, created_at);
CREATE INDEX idx_auth_codes_ip ON auth_codes(ip_hash, created_at);

-- Server logos uploaded by owners. PENDING until an admin approves or rejects;
-- an approved one becomes servers.logo_url = /api/v1/logos/<id>.
CREATE TABLE server_logos (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  uploaded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
  mime         TEXT NOT NULL,
  bytes        BLOB NOT NULL,
  size         INTEGER NOT NULL,
  reason       TEXT,
  reviewed_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_logos_status ON server_logos(status, created_at);
CREATE INDEX idx_logos_server ON server_logos(server_id, created_at);

-- Why a submitted server was not published (shown to its owner).
ALTER TABLE servers ADD COLUMN moderation_note TEXT;
