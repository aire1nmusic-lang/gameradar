-- Owner edits are private until a human approves them; only approved summary projects to D1.
CREATE TABLE gs_owner_summary_edits (
 id text PRIMARY KEY,
 server_id text NOT NULL REFERENCES gs_server_registry(server_id),
 user_id text NOT NULL REFERENCES gs_users(id),
 summary text NOT NULL CHECK(length(summary) BETWEEN 20 AND 280),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 reviewer_id text REFERENCES gs_users(id),
 reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);
CREATE UNIQUE INDEX ON gs_owner_summary_edits(server_id) WHERE status='PENDING';
CREATE INDEX ON gs_owner_summary_edits(server_id,resolved_at DESC) WHERE status='APPROVED';
INSERT INTO gs_role_permissions(role,permission) VALUES ('ADMIN','servers.review'),('MODERATOR','servers.review');
