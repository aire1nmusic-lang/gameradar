-- Correct Support by appending a refund, never rewriting the original debit.
CREATE TABLE gs_support_refunds (
 support_id text PRIMARY KEY REFERENCES gs_support(id),
 ledger_id text NOT NULL UNIQUE REFERENCES gs_coin_ledger(id),
 actor_id text NOT NULL REFERENCES gs_users(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),
 idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(actor_id,idempotency_key)
);
CREATE TRIGGER gs_support_refunds_immutable BEFORE UPDATE OR DELETE ON gs_support_refunds
 FOR EACH ROW EXECUTE FUNCTION gs_no_ledger_mutation();
CREATE VIEW gs_active_support AS SELECT s.* FROM gs_support s
 WHERE NOT EXISTS(SELECT 1 FROM gs_support_refunds r WHERE r.support_id=s.id);
INSERT INTO gs_role_permissions(role,permission) VALUES('ADMIN','support.refund');
