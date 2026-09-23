-- Monitoring lease.
--
-- A pass stamps attempted_at on a card *before* probing it and the queue
-- orders by the last attempt, so a card whose check crashes or times out the
-- invocation no longer comes back first on every tick and starves the rest.
ALTER TABLE server_online ADD COLUMN attempted_at TEXT;

-- Votifier delivery bookkeeping (Minecraft only).
--   delivering_at — lease taken before a send, so two senders never race;
--   delivery_attempts / last_delivery_error — bounded retries, visible to the owner.
ALTER TABLE votes ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE votes ADD COLUMN delivering_at TEXT;
ALTER TABLE votes ADD COLUMN last_delivery_error TEXT;
