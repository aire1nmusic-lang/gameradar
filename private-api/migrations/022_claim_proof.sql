-- Additive private-only proof state. Existing claims need the same proof before approval.
CREATE TABLE gs_claim_proofs (
 claim_id text PRIMARY KEY REFERENCES gs_claims(id),
 token_hash text NOT NULL, method text NOT NULL CHECK(method IN ('SITE','DNS','MANUAL')),
 target text NOT NULL, expires_at timestamptz NOT NULL,
 checked_at timestamptz, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
