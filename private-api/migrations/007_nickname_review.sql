CREATE TABLE gs_nickname_reviews (
 support_id text PRIMARY KEY REFERENCES gs_support(id),
 nickname text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ALLOW','ANONYMOUS','REVIEW')),
 model text,
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, lease_token text, last_error text,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON gs_nickname_reviews(available_at) WHERE status='PENDING';
