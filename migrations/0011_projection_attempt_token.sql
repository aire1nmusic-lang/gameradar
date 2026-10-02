-- A batch may mutate public card fields only when its version won the monotonic upsert.
-- Additive: existing projections retain their version and receive an empty token.
ALTER TABLE public_server_projection ADD COLUMN apply_token TEXT NOT NULL DEFAULT '';
