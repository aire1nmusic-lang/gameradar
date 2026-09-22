-- Online from more than our own probe.
--
-- A card may have several places its online can be read from, tried in trust
-- order on every monitoring pass:
--   DIRECT   — GameScout's own probe (monitoring_targets, unchanged)
--   OFFICIAL — a counter the project publishes on its own site or API
--   EXTERNAL — a third-party monitor (mcsrvstat.us, BattleMetrics, …)
-- Only DIRECT can ever produce VERIFIED. Whatever answers first is stored, with
-- its tier, name, public URL and the time the number was observed.
CREATE TABLE online_sources (
  id          TEXT PRIMARY KEY,
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  -- OFFICIAL | EXTERNAL
  tier        TEXT NOT NULL,
  -- official_json | official_html | mcsrvstat | mcstatus | battlemetrics
  provider    TEXT NOT NULL,
  -- shown to players verbatim: "mcsrvstat.us", "Сайт проекта"
  name        TEXT NOT NULL,
  -- a public page where a player can check the number themselves
  url         TEXT,
  -- provider settings (address, JSON path, regex, remote id), never public
  config      TEXT NOT NULL DEFAULT '{}',
  enabled     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (server_id, provider)
);

CREATE INDEX idx_online_sources_server ON online_sources(server_id, enabled);

ALTER TABLE server_online ADD COLUMN source_tier TEXT;
ALTER TABLE server_online ADD COLUMN source_url TEXT;
-- when the number was true according to its source (a monitor may cache)
ALTER TABLE server_online ADD COLUMN observed_at TEXT;
-- how many checks actually ran in the last 24 hours (shown to players)
ALTER TABLE server_online ADD COLUMN checks_24h INTEGER NOT NULL DEFAULT 0;

ALTER TABLE online_samples ADD COLUMN source_tier TEXT;
ALTER TABLE online_samples ADD COLUMN source_name TEXT;
ALTER TABLE online_samples ADD COLUMN source_url TEXT;
ALTER TABLE online_samples ADD COLUMN fetched_at TEXT;

-- Card analytics: one event per visitor, card and kind per window. The
-- visitor is a salted hash of address + user agent, never the address.
ALTER TABLE server_events ADD COLUMN visitor_hash TEXT;
CREATE INDEX idx_events_dedupe ON server_events(server_id, kind, visitor_hash, at);
