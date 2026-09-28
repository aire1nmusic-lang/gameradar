-- Only the public scope key; claimant, evidence and AI output remain private.
ALTER TABLE public_server_projection ADD COLUMN restricted_materials TEXT NOT NULL DEFAULT '[]';
