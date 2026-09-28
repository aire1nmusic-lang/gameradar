-- Factual card corrections stay private until another administrator approves them.
CREATE TABLE gs_owner_fact_edits (
 id text PRIMARY KEY,
 server_id text NOT NULL REFERENCES gs_server_registry(server_id),
 user_id text NOT NULL REFERENCES gs_users(id),
 field text NOT NULL CHECK(field IN ('version','rates','region','openedAt')),
 value text NOT NULL CHECK(length(value) BETWEEN 1 AND 80),
 evidence text NOT NULL CHECK(length(evidence) BETWEEN 20 AND 1000),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 reviewer_id text REFERENCES gs_users(id),
 reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);
CREATE UNIQUE INDEX ON gs_owner_fact_edits(server_id,field) WHERE status='PENDING';
CREATE INDEX ON gs_owner_fact_edits(server_id,field,resolved_at DESC) WHERE status='APPROVED';
