-- Only public slot keys; no claimant, contact, evidence, review text or secrets.
ALTER TABLE public_server_projection ADD COLUMN restricted_links TEXT NOT NULL DEFAULT '[]';
