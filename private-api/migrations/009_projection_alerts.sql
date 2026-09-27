-- Private operational state; public D1 never receives queue contents or alerts.
CREATE TABLE gs_system_alerts (
 key text PRIMARY KEY,
 active boolean NOT NULL DEFAULT false,
 opened_at timestamptz,
 resolved_at timestamptz,
 last_snapshot jsonb NOT NULL DEFAULT '{}'
);
