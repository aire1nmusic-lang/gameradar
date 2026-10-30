-- Additive private-only evidence. Never projected to the public catalog or stored in D1.
CREATE TABLE gs_claim_documents (
 id text PRIMARY KEY, claim_id text NOT NULL REFERENCES gs_claims(id),
 name text NOT NULL, mime text NOT NULL CHECK(mime IN ('application/pdf','image/jpeg','image/png')),
 data bytea NOT NULL CHECK(octet_length(data) BETWEEN 1 AND 1048576),
 sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(claim_id,sha256)
);
CREATE INDEX ON gs_claim_documents(claim_id);
ALTER TABLE gs_claim_proofs DROP CONSTRAINT gs_claim_proofs_method_check;
ALTER TABLE gs_claim_proofs ADD CONSTRAINT gs_claim_proofs_method_check CHECK(method IN ('SITE','DNS','MANUAL','DOCUMENT'));
