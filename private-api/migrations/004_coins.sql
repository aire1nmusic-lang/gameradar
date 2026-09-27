-- Integer Coins only: no float balances, no transfers and no withdrawals.
CREATE TABLE gs_coin_accounts (
 user_id text PRIMARY KEY REFERENCES gs_users(id),
 balance integer NOT NULL DEFAULT 0 CHECK(balance>=0)
);
CREATE TABLE gs_coin_ledger (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES gs_users(id),
 kind text NOT NULL CHECK(kind IN ('PURCHASE','SUPPORT','AVATAR','LINK_SLOT','REFUND','ADJUSTMENT')),
 delta integer NOT NULL CHECK(delta<>0), related_id text,
 idempotency_key text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key),
 CHECK((kind='PURCHASE' AND delta>0) OR (kind IN ('SUPPORT','AVATAR','LINK_SLOT') AND delta<0)
       OR kind IN ('REFUND','ADJUSTMENT'))
);
CREATE INDEX ON gs_coin_ledger(user_id,created_at DESC);
CREATE TABLE gs_support (
 id text PRIMARY KEY, server_id text NOT NULL REFERENCES gs_server_registry(server_id),
 user_id text NOT NULL REFERENCES gs_users(id), ledger_id text NOT NULL UNIQUE REFERENCES gs_coin_ledger(id),
 coins integer NOT NULL CHECK(coins>0), anonymous boolean NOT NULL,
 public_nick text NOT NULL, nickname_decision text NOT NULL CHECK(nickname_decision IN ('ALLOW','ANONYMOUS','REVIEW')),
 idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX ON gs_support(server_id,created_at DESC);
CREATE FUNCTION gs_no_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ledger is append only'; END $$;
CREATE TRIGGER gs_coin_ledger_immutable BEFORE UPDATE OR DELETE ON gs_coin_ledger FOR EACH ROW EXECUTE FUNCTION gs_no_ledger_mutation();
