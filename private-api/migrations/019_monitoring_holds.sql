-- An admin can pause an owner-submitted public probe without changing ownership
-- or erasing the owner's configuration. Every transition is audited separately.
CREATE TABLE gs_monitoring_holds (
 server_id text PRIMARY KEY REFERENCES gs_server_registry(server_id),
 active boolean NOT NULL DEFAULT true,
 reason text NOT NULL,
 reviewed_by text NOT NULL REFERENCES gs_users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
