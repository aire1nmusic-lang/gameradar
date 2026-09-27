-- Test orders only. Live sales require a separate reviewed release and fiscal configuration.
CREATE TABLE gs_test_payments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id text NOT NULL REFERENCES gs_users(id),
 coins integer NOT NULL CHECK(coins BETWEEN 1 AND 10000),
 amount_kopecks integer NOT NULL CHECK(amount_kopecks=coins*5000),
 nonce text NOT NULL UNIQUE CHECK(length(nonce)=64),
 receipt jsonb NOT NULL,
 status text NOT NULL DEFAULT 'TEST_PENDING' CHECK(status IN ('TEST_PENDING','TEST_PAID')),
 idempotency_key text NOT NULL,
 ledger_id text UNIQUE REFERENCES gs_coin_ledger(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 paid_at timestamptz,
 UNIQUE(user_id,idempotency_key),
 CHECK((status='TEST_PENDING' AND ledger_id IS NULL AND paid_at IS NULL)
       OR (status='TEST_PAID' AND ledger_id IS NOT NULL AND paid_at IS NOT NULL))
);
CREATE INDEX ON gs_test_payments(user_id,created_at DESC);
