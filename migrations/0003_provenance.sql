-- Provenance for catalogue records GameScout imported from public data
-- rather than received from an owner.
--
--   · import_key is the stable identity of an imported record
--     ("mc:mc.hypixel.net"); a repeat import updates the row, never duplicates it;
--   · source_* names the page the record was taken from, source_refs lists every
--     public page that confirmed it ([{name,url}]);
--   · imported_at is the first import, last_source_check_at the last time the
--     facts were re-checked against their sources.
ALTER TABLE servers ADD COLUMN import_key TEXT;
ALTER TABLE servers ADD COLUMN source_name TEXT;
ALTER TABLE servers ADD COLUMN source_url TEXT;
ALTER TABLE servers ADD COLUMN source_refs TEXT NOT NULL DEFAULT '[]';
ALTER TABLE servers ADD COLUMN imported_at TEXT;
ALTER TABLE servers ADD COLUMN last_source_check_at TEXT;
CREATE UNIQUE INDEX idx_servers_import_key ON servers(import_key) WHERE import_key IS NOT NULL;

-- The identity a directly probed endpoint must report (FiveM sv_projectName /
-- hostname). A reassigned IP must never hand its numbers to another card.
ALTER TABLE monitoring_targets ADD COLUMN expect_name TEXT;
