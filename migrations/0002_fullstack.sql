-- Preserve the initial schema while making credentials and delivery explicit.
-- Existing prototype credentials are invalidated, never copied into a hash column.
DELETE FROM sessions;
ALTER TABLE sessions RENAME COLUMN token TO token_hash;
UPDATE vote_integrations SET api_key = 'invalidated:' || server_id;
ALTER TABLE vote_integrations RENAME COLUMN api_key TO api_key_hash;
ALTER TABLE vote_integrations ADD COLUMN has_api_key INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vote_integrations ADD COLUMN reward_title TEXT NOT NULL DEFAULT '';
ALTER TABLE votes ADD COLUMN delivered_at TEXT;
ALTER TABLE server_online ADD COLUMN players_known INTEGER NOT NULL DEFAULT 0;
ALTER TABLE server_online ADD COLUMN max_known INTEGER NOT NULL DEFAULT 0;
ALTER TABLE online_samples ADD COLUMN players_known INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_votes_ip_created ON votes(ip_hash, created_at);
CREATE UNIQUE INDEX idx_users_provider_identity ON users(provider, provider_id);
