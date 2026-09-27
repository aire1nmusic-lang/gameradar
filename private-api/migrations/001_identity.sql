CREATE TABLE gs_users (
 id text PRIMARY KEY, email text UNIQUE, display_name text NOT NULL,
 password_hash text, email_verified_at timestamptz, banned_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gs_sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES gs_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE INDEX ON gs_sessions(user_id);
CREATE TABLE gs_identities (
 provider text NOT NULL, subject text NOT NULL, user_id text NOT NULL REFERENCES gs_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,subject), UNIQUE(user_id,provider)
);
CREATE TABLE gs_tokens (
 token_hash text PRIMARY KEY, email text NOT NULL, purpose text NOT NULL CHECK(purpose IN ('REGISTER','RESET','EMAIL')),
 payload jsonb NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(email,purpose)
);
CREATE TABLE gs_oauth_states (
 state_hash text PRIMARY KEY, browser_hash text NOT NULL, provider text NOT NULL,
 verifier text NOT NULL, next_path text NOT NULL, link_session_hash text,
 expires_at timestamptz NOT NULL
);
CREATE TABLE gs_rate_limits (
 key text NOT NULL, bucket_window bigint NOT NULL, count integer NOT NULL,
 PRIMARY KEY(key,bucket_window)
);
CREATE TABLE gs_permissions (
 user_id text NOT NULL REFERENCES gs_users(id), permission text NOT NULL,
 PRIMARY KEY(user_id,permission)
);
-- A private registry imported from the PUBLIC catalogue, not an authority for public cards.
-- Ownership is exclusively private; no public projection is consulted for permissions.
CREATE TABLE gs_server_registry (
 server_id text PRIMARY KEY, game_id text NOT NULL CHECK(game_id IN ('lineage2','minecraft','gtarp')),
 name text NOT NULL, slug text NOT NULL UNIQUE, website text,
 owner_id text REFERENCES gs_users(id), version bigint NOT NULL DEFAULT 0
);
CREATE TABLE gs_claims (
 id text PRIMARY KEY, server_id text NOT NULL REFERENCES gs_server_registry(server_id),
 user_id text NOT NULL REFERENCES gs_users(id), status text NOT NULL DEFAULT 'PENDING'
 CHECK(status IN ('PENDING','VERIFIED','REJECTED')), evidence text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, reviewer_id text REFERENCES gs_users(id), reason text
);
CREATE UNIQUE INDEX ON gs_claims(server_id,user_id) WHERE status='PENDING';
CREATE TABLE gs_audit (
 id bigserial PRIMARY KEY, actor_id text REFERENCES gs_users(id), action text NOT NULL,
 target text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gs_public_outbox (
 id bigserial PRIMARY KEY, server_id text NOT NULL REFERENCES gs_server_registry(server_id),
 version bigint NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz, attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, lease_token text, last_error text, UNIQUE(server_id,version)
);
CREATE INDEX ON gs_public_outbox(available_at) WHERE delivered_at IS NULL;
CREATE TABLE gs_mail_outbox (
 id text PRIMARY KEY, ciphertext text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz, attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, lease_token text, last_error text
);
CREATE FUNCTION gs_no_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit is append only'; END $$;
CREATE TRIGGER gs_audit_immutable BEFORE UPDATE OR DELETE ON gs_audit FOR EACH ROW EXECUTE FUNCTION gs_no_audit_mutation();
