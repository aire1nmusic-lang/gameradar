CREATE TABLE gs_votes (
 id text PRIMARY KEY, server_id text NOT NULL REFERENCES gs_server_registry(server_id),
 user_id text NOT NULL REFERENCES gs_users(id), idempotency_key text NOT NULL,
 device_hash text, ip_hash text NOT NULL, asn text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX ON gs_votes(server_id,user_id,created_at DESC);
CREATE INDEX ON gs_votes(device_hash,created_at DESC) WHERE device_hash IS NOT NULL;
CREATE INDEX ON gs_votes(ip_hash,created_at DESC);
CREATE TABLE gs_vote_rules (
 id integer PRIMARY KEY CHECK(id=1), window_hours integer NOT NULL CHECK(window_hours BETWEEN 1 AND 24*90),
 max_per_window integer NOT NULL CHECK(max_per_window BETWEEN 1 AND 20),
 ip_daily_limit integer NOT NULL CHECK(ip_daily_limit BETWEEN 1 AND 100),
 device_daily_limit integer NOT NULL CHECK(device_daily_limit BETWEEN 1 AND 100)
);
INSERT INTO gs_vote_rules VALUES(1,24,1,10,5);
