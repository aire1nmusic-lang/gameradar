-- Public aggregates only: no supporter ids, ledger, payments or private signals.
ALTER TABLE public_server_projection ADD COLUMN support_coins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public_server_projection ADD COLUMN support_participants INTEGER NOT NULL DEFAULT 0;
