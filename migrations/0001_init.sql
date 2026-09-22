-- GameScout — initial schema.
--
-- Design notes:
--   · ids are text so they can be slugs or ULIDs without a migration;
--   · list-ish columns (modes, tags, languages) are JSON text — D1 is SQLite,
--     and these are never queried by element, only filtered in SQL with LIKE
--     or post-filtered in the API;
--   · every timestamp is ISO-8601 UTC text, which sorts correctly in SQLite;
--   · live online state is a separate row from the server record, so a probe
--     writes one small row and never touches the catalogue entry.

-- ── games & chronicles ──────────────────────────────────────────────────────

CREATE TABLE games (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  tagline       TEXT NOT NULL DEFAULT '',
  motif         TEXT NOT NULL DEFAULT 'cubes',
  color_from    TEXT NOT NULL DEFAULT '#14171f',
  color_to      TEXT NOT NULL DEFAULT '#08090d',
  accent        TEXT NOT NULL DEFAULT '#2ee0a6',
  -- primary games get full product support; the rest exist for SEO coverage
  is_primary    INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  created_at    TEXT NOT NULL
);

CREATE TABLE chronicles (
  id            TEXT PRIMARY KEY,
  game_id       TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  label         TEXT NOT NULL,
  tagline       TEXT NOT NULL DEFAULT '',
  theme_id      TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  UNIQUE (game_id, slug)
);

-- Version labels a server may declare that map onto a chronicle.
CREATE TABLE chronicle_versions (
  chronicle_id  TEXT NOT NULL REFERENCES chronicles(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  PRIMARY KEY (chronicle_id, version)
);

-- ── people ─────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  provider      TEXT NOT NULL DEFAULT 'EMAIL',
  provider_id   TEXT,
  roles         TEXT NOT NULL DEFAULT '["PLAYER"]',
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token         TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ── servers ────────────────────────────────────────────────────────────────

CREATE TABLE servers (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  game_id       TEXT NOT NULL REFERENCES games(id),
  chronicle_id  TEXT REFERENCES chronicles(id),
  version       TEXT NOT NULL DEFAULT '',

  summary       TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  rates         TEXT,
  highlights    TEXT NOT NULL DEFAULT '[]',
  tags          TEXT NOT NULL DEFAULT '[]',
  modes         TEXT NOT NULL DEFAULT '[]',
  languages     TEXT NOT NULL DEFAULT '[]',

  website       TEXT,
  discord       TEXT,
  telegram      TEXT,

  region        TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT '',
  flag          TEXT NOT NULL DEFAULT '',

  hue           INTEGER NOT NULL DEFAULT 200,
  logo_url      TEXT,
  banner_url    TEXT,

  max_players   INTEGER NOT NULL DEFAULT 0,

  -- DRAFT | PENDING_MODERATION | PUBLISHED | REJECTED | ARCHIVED
  moderation    TEXT NOT NULL DEFAULT 'PENDING_MODERATION',
  owner_id      TEXT REFERENCES users(id),
  submitted_by  TEXT REFERENCES users(id),

  rating        REAL NOT NULL DEFAULT 0,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  votes_count   INTEGER NOT NULL DEFAULT 0,
  favorites     INTEGER NOT NULL DEFAULT 0,

  promo         TEXT,

  opened_at     TEXT,
  added_at      TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  last_wipe_at  TEXT,
  next_wipe_at  TEXT,

  launch_at     TEXT,
  launch_type   TEXT,
  launch_preregs INTEGER NOT NULL DEFAULT 0,

  -- 1 for fixtures, so demo rows can always be told apart from real imports
  is_demo       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_servers_game ON servers(game_id, moderation);
CREATE INDEX idx_servers_chronicle ON servers(chronicle_id);
CREATE INDEX idx_servers_owner ON servers(owner_id);
CREATE INDEX idx_servers_moderation ON servers(moderation);

-- ── monitoring ─────────────────────────────────────────────────────────────

-- How to reach a server. Never exposed in full through the public API.
CREATE TABLE monitoring_targets (
  server_id     TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  -- GAME_PROTOCOL | SERVER_API | AGENT | LOGIN_SERVER | OWNER_SUBMITTED
  method        TEXT NOT NULL DEFAULT 'OWNER_SUBMITTED',
  host          TEXT,
  port          INTEGER,
  api_url       TEXT,
  agent_token   TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1
);

-- Current online state, one row per server, rewritten by every probe.
CREATE TABLE server_online (
  server_id     TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  -- VERIFIED | LIVE | OWNER_REPORTED | OFFLINE | ANOMALY | PENDING | CHECKING
  status        TEXT NOT NULL DEFAULT 'OWNER_REPORTED',
  current       INTEGER NOT NULL DEFAULT 0,
  max           INTEGER NOT NULL DEFAULT 0,
  checked_at    TEXT,
  source        TEXT NOT NULL DEFAULT 'Данные сервера',
  method        TEXT NOT NULL DEFAULT 'OWNER_SUBMITTED',
  latency_ms    INTEGER,
  note          TEXT,
  -- rolling aggregates, recomputed from online_samples
  change_24h    REAL NOT NULL DEFAULT 0,
  peak_24h      INTEGER NOT NULL DEFAULT 0,
  avg_7d        INTEGER NOT NULL DEFAULT 0,
  peak_30d      INTEGER NOT NULL DEFAULT 0,
  uptime_24h    REAL NOT NULL DEFAULT 0
);

CREATE TABLE online_samples (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id     TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  at            TEXT NOT NULL,
  players       INTEGER NOT NULL,
  status        TEXT NOT NULL,
  latency_ms    INTEGER
);

CREATE INDEX idx_samples_server_at ON online_samples(server_id, at);

-- ── ownership ──────────────────────────────────────────────────────────────

CREATE TABLE server_claims (
  id            TEXT PRIMARY KEY,
  server_id     TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- DNS_RECORD | SITE_FILE | DISCORD | MANUAL_REVIEW
  method        TEXT NOT NULL,
  -- PENDING | VERIFIED | REJECTED
  status        TEXT NOT NULL DEFAULT 'PENDING',
  proof_token   TEXT NOT NULL,
  note          TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  resolved_at   TEXT
);

CREATE INDEX idx_claims_server ON server_claims(server_id);
CREATE INDEX idx_claims_user ON server_claims(user_id, status);

-- ── votes ──────────────────────────────────────────────────────────────────

CREATE TABLE vote_integrations (
  server_id      TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  -- PULL_API | VOTIFIER | WEBHOOK
  delivery       TEXT NOT NULL DEFAULT 'PULL_API',
  api_key        TEXT NOT NULL UNIQUE,
  votifier_host  TEXT,
  votifier_port  INTEGER,
  votifier_token TEXT,
  webhook_url    TEXT,
  cooldown_hours INTEGER NOT NULL DEFAULT 12,
  reward_text    TEXT,
  updated_at     TEXT NOT NULL
);

CREATE TABLE votes (
  id            TEXT PRIMARY KEY,
  server_id     TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  nickname      TEXT NOT NULL,
  user_id       TEXT REFERENCES users(id),
  -- identity used for the cooldown: user id when signed in, else ip+nickname hash
  voter_key     TEXT NOT NULL,
  ip_hash       TEXT,
  -- PENDING | CLAIMED | REJECTED
  status        TEXT NOT NULL DEFAULT 'PENDING',
  delivery      TEXT NOT NULL DEFAULT 'PULL_API',
  created_at    TEXT NOT NULL,
  claimed_at    TEXT
);

CREATE INDEX idx_votes_server_status ON votes(server_id, status);
CREATE INDEX idx_votes_cooldown ON votes(server_id, voter_key, created_at);
CREATE INDEX idx_votes_created ON votes(created_at);

-- ── commerce (minimal, filled in a later stage) ────────────────────────────

CREATE TABLE boost_orders (
  id            TEXT PRIMARY KEY,
  server_id     TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL REFERENCES users(id),
  package_id    TEXT NOT NULL,
  boosts        INTEGER NOT NULL,
  price         INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT
);

CREATE INDEX idx_boost_server ON boost_orders(server_id);

-- ── card analytics ─────────────────────────────────────────────────────────

CREATE TABLE server_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id     TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  -- VIEW | CLICK | FAVORITE | VOTE
  kind          TEXT NOT NULL,
  at            TEXT NOT NULL,
  source        TEXT
);

CREATE INDEX idx_events_server_at ON server_events(server_id, kind, at);
