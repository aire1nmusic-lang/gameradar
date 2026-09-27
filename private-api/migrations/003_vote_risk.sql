-- Risk thresholds are adjustable without rewriting accepted votes.
ALTER TABLE gs_vote_rules ADD COLUMN asn_daily_limit integer NOT NULL DEFAULT 200 CHECK(asn_daily_limit BETWEEN 1 AND 100000);
CREATE INDEX ON gs_votes(asn,created_at DESC) WHERE asn IS NOT NULL;
