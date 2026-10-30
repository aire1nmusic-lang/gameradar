-- Free-plan community features (accounts-fn/community.mjs), owner decision 29.10.2026: player votes, owner Claims,
-- owner card edits and admin moderation on Cloudflare D1, next to the acc_* accounts. Coins and payments are not here.
-- New tables and two added columns only; nothing existing is changed or removed.
-- IP addresses and device signals are stored only as keyed hashes (HMAC with ACCOUNTS_RATE_KEY).
-- Times are ISO-8601 UTC strings (lexicographic order = time order).

-- Google/Discord confirmed the account's e-mail at the latest sign-in (the address itself is still not stored).
ALTER TABLE acc_identities ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE acc_audit ADD COLUMN details TEXT NOT NULL DEFAULT '{}';
CREATE INDEX idx_acc_audit_target ON acc_audit(target);

-- Confirmed owner of a published card (servers.owner_id belongs to the legacy users table and stays untouched).
CREATE TABLE fc_owners (
  server_id   TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES acc_users(id),
  claim_id    TEXT NOT NULL,
  granted_at  TEXT NOT NULL
);
CREATE INDEX idx_fc_owners_user ON fc_owners(user_id);

CREATE TABLE fc_claims (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES acc_users(id),
  evidence     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
  reason       TEXT,
  reviewer_id  TEXT,
  resolution_id TEXT,   -- set by the one admin request that closed the claim; guards the rest of its batch
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);
CREATE UNIQUE INDEX idx_fc_claims_pending ON fc_claims(server_id, user_id) WHERE status = 'PENDING';
CREATE INDEX idx_fc_claims_status ON fc_claims(status, created_at);
CREATE INDEX idx_fc_claims_user ON fc_claims(user_id, created_at);

-- One live proof code per claim; only its SHA-256 is stored.
CREATE TABLE fc_claim_proofs (
  claim_id     TEXT PRIMARY KEY REFERENCES fc_claims(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  method       TEXT NOT NULL CHECK (method IN ('SITE','DNS','MANUAL')),
  target       TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  checked_at   TEXT,
  consumed_at  TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE fc_votes (
  id               TEXT PRIMARY KEY,
  server_id        TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES acc_users(id),
  idempotency_key  TEXT NOT NULL,
  device_hash      TEXT,
  ip_hash          TEXT NOT NULL,
  asn              TEXT,
  created_at       TEXT NOT NULL,
  review_status    TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK (review_status IN ('ACCEPTED','VOIDED')),
  reviewed_by      TEXT,
  review_reason    TEXT,
  reviewed_at      TEXT,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX idx_fc_votes_user_server ON fc_votes(user_id, server_id, created_at);
CREATE INDEX idx_fc_votes_ip ON fc_votes(ip_hash, created_at);
CREATE INDEX idx_fc_votes_device ON fc_votes(device_hash, created_at);
CREATE INDEX idx_fc_votes_asn ON fc_votes(asn, created_at);
CREATE INDEX idx_fc_votes_created ON fc_votes(created_at);
CREATE INDEX idx_fc_votes_server ON fc_votes(server_id, review_status, created_at);

CREATE TABLE fc_vote_rules (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  window_hours        INTEGER NOT NULL,
  max_per_window      INTEGER NOT NULL,
  ip_daily_limit      INTEGER NOT NULL,
  device_daily_limit  INTEGER NOT NULL,
  asn_daily_limit     INTEGER NOT NULL
);
-- Private-core defaults, except the ASN limit: Cloudflare reports a real ASN, and 200 votes a day per network would lock
-- out a whole mobile operator until Turnstile is configured. Admins can tighten it in the vote rules tab.
INSERT INTO fc_vote_rules (id, window_hours, max_per_window, ip_daily_limit, device_daily_limit, asn_daily_limit) VALUES (1, 24, 1, 10, 5, 20000);

CREATE TABLE fc_summary_edits (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES acc_users(id),
  summary      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reason       TEXT,
  reviewer_id  TEXT,
  resolution_id TEXT,
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);
CREATE UNIQUE INDEX idx_fc_summary_pending ON fc_summary_edits(server_id) WHERE status = 'PENDING';

CREATE TABLE fc_fact_edits (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES acc_users(id),
  field        TEXT NOT NULL,
  value        TEXT NOT NULL,
  evidence     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reason       TEXT,
  reviewer_id  TEXT,
  resolution_id TEXT,
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);
CREATE UNIQUE INDEX idx_fc_fact_pending ON fc_fact_edits(server_id, field) WHERE status = 'PENDING';
