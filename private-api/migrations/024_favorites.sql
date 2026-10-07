-- Private account preferences; no public projection or financial data.
CREATE TABLE gs_favorites (
 user_id text NOT NULL REFERENCES gs_users(id) ON DELETE CASCADE,
 server_id text NOT NULL REFERENCES gs_server_registry(server_id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, server_id)
);
CREATE INDEX gs_favorites_user_created ON gs_favorites(user_id, created_at DESC);
