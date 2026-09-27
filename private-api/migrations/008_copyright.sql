CREATE TABLE gs_copyright_claims (
 id text PRIMARY KEY,
 server_id text NOT NULL REFERENCES gs_server_registry(server_id),
 claimant_name text NOT NULL, contact_email text NOT NULL,
 rights_basis text NOT NULL, work_description text NOT NULL,
 material_key text NOT NULL CHECK(material_key IN ('site','discord','telegram')),
 material_url text NOT NULL, evidence text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING_AI' CHECK(status IN ('PENDING_AI','NEEDS_INFO','REVIEW_RESTRICTED','REJECTED_FAKE','RESTORED','REJECTED')),
 ai_classification text, ai_reason text,
 reviewer_id text REFERENCES gs_users(id), resolution_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX ON gs_copyright_claims(status,created_at);
CREATE TABLE gs_material_restrictions (
 id text PRIMARY KEY,claim_id text NOT NULL UNIQUE REFERENCES gs_copyright_claims(id),
 server_id text NOT NULL REFERENCES gs_server_registry(server_id),
 material_key text NOT NULL CHECK(material_key IN ('site','discord','telegram')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),restored_at timestamptz,
 restored_by text REFERENCES gs_users(id),restore_reason text
);
CREATE INDEX ON gs_material_restrictions(server_id) WHERE active=true;
CREATE TABLE gs_copyright_ai_jobs (
 claim_id text PRIMARY KEY REFERENCES gs_copyright_claims(id),
 attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,lease_token text,last_error text,
 completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gs_telegram_outbox (
 id text PRIMARY KEY,event text NOT NULL,message text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,lease_token text,last_error text,
 delivered_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
