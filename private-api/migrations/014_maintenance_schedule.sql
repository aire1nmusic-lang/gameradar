-- Persist the hourly balance-check cadence across ephemeral container instances.
CREATE TABLE gs_maintenance_schedule (
 key text PRIMARY KEY,
 next_at timestamptz NOT NULL
);
INSERT INTO gs_maintenance_schedule(key,next_at) VALUES ('openrouter_balance',now());
