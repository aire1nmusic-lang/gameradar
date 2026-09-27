# GameScout core — progress, 27.09.2026

Scope and acceptance criteria: [roadmap](roadmap-2026-09-27.md). Evidence and architecture comparison: [Reality Check](core-reality-check.md). The product core is **not ready**. Production DNS, D1 data, real payments, and irreversible migrations were not changed.

## Slice 1: private identity, Claim, public outbox, People's rating (local)

**Implemented.** `private-api/migrations/001_identity.sql` and `002_votes.sql` define PostgreSQL-owned identities, session hashes, one-time tokens, OAuth states, server grants, claims, audit, mail/public outboxes, and rolling votes. `private-api/app.mjs` implements email-link registration/verification/reset, password login, session revocation, subject-based Google/VK/Yandex/Discord OAuth with explicit account linking, Claim review, per-server permissions, and verified-email votes. Rate limits and account/device/IP signals gate voting; ASN is recorded for later review. High-risk votes require server-verified Turnstile. Scrypt hashes passwords; private mail links are encrypted at rest in the outbox. Do not claim these signals identify a unique human.

The private transaction writes the authoritative mutation and an outbox event together. `private-api/outbox.mjs` retries delivery; `worker/lib/public-projection.ts` accepts only public server fields and a monotonic per-server version. The D1 migration `0007_public_projection.sql` is additive and **local only**. `PUBLIC_ONLY` can close legacy private Worker routes at cutover. No cross-database atomic write is needed. Delivery lag is queryable; an operational alert is still needed.

Local UI at `npm run dev:api`, `npm run dev:private`, and `npm run dev:core-ui` exposes `/account`, Claim, and voting. The local mail link is visible at `http://127.0.0.1:8789/__dev/mail`; this endpoint exists only with `--local`. Production has no implicit database migration or mail fallback. The old D1 account route no longer merges OAuth users just because emails match; VK state is checked.

Catalog and server page edits remove VIP/TOP visual treatment and show **«Онлайн не указан»** for unknown online. Empty online peaks/averages are shown as dashes. `/rating` in private mode reads votes from PostgreSQL, with separate L2/Minecraft/GTA filters and no paid ordering. The old D1 votes sort is hidden in private mode because it is not the new rolling rating. Demo pages stay `noindex`; generated demo media is explicitly marked as such. Full unified server-page information and Support are still outstanding.

**Verified.** Six PostgreSQL/PGlite invariant tests pass for one-time credentials, expiry/races, non-merging OAuth, Claim player→owner→admin across L2/Minecraft/GTA, outbox retry/stale/PII/rollback, and vote window/idempotency/risk. Legacy account acceptance passed (output report), all 35 monitoring adapter tests passed, TypeScript check and Vite build passed. In-app browser at `127.0.0.1:5173` showed three GTA RP demo cards, server page with honest unknown metrics, `/rating` with an empty rolling window, and sign-in link to `/account`. This is local evidence, not production acceptance. The build warns about a large JS chunk.

**Rollback.** No production state to roll back. To return local UI to legacy mode, run normal `npm run dev` instead of `dev:core-ui`, stop private API, and leave `PUBLIC_ONLY` unset. D1 migration 0007 is additive; do not roll back a live projection by dropping it without first quiescing delivery and checking its queue. PostgreSQL migrations are intended for a new, empty database and need a backup/restore plan before a live deployment. Existing D1 private records require an explicit, verified export/import and temporary write freeze before cutover; deleting them is out of scope.

**BLOCKED for live acceptance.** No Yandex PostgreSQL cluster or deployed private API topology; no verified email sender, production OAuth app secrets/callbacks, Turnstile credentials, or production signing/encryption secrets. Existing user data still lives in production D1 until an approved migration. Live browser OAuth and mail delivery cannot be claimed. The local test uses generated keys and PGlite, never production credentials.

**Cost.** 0 ₽ in newly created cloud resources. Yandex price estimate and assumptions are in the Reality Check; approve the exact region, HA topology, disk, backup, and monthly budget before creating resources.

## Slice 2: factual catalogs and responsive server pages (local)

`ServerRow` now exposes the same version, rates/mode, opening date and region facts for L2, Minecraft and GTA RP at phone and desktop widths, with a visible «Подробнее» action. Missing values say so. Current online appears only for a fresh known measurement, with its source and relative update time; missing measurement hides the capacity bar and trend. The server page no longer labels an unknown count as current, shows an unknown position when no rolling votes exist, and re-reads the ranking after a vote instead of incrementing the UI on an idempotent replay. Demo `example.com` links and their «Играть» CTA are suppressed.

**Verified:** TypeScript check and an in-app browser at 390 px for all three game catalogs and the L2/Minecraft profiles. Missing online and peaks stayed unknown; the mobile Minecraft headline no longer overflowed. The browser viewport was restored. This does not verify non-demo pages against a live measurement. Support and its position/statistics block remain part of slice 4; stage 2 is not fully accepted until those data are present.

**Rollback/cost:** presentation-only changes can be reverted at this commit; private schema and production state were not touched. 0 ₽ additional cloud resources. Next: complete organic ordering and risk challenges, then append-only Coins and Support.

## Remaining slices

2. Verify non-demo cards against measured public data and add the Support/statistics block with slice 4. Verify the public HTTP response and error states.
3. Finish separate organic sorting in catalogs, background expiry refresh/lag alarms and Turnstile client challenge. Re-test with real deployment signals. Keep money out of the formula.
4. Add private append-only Coins ledger, Support and separate sort, Robokassa **test-only** notifications/receipt/reconciliation, with invariant and rollback tests. Do not enable the unapproved discount grid or sales.
5. Expand scoped admin permissions and pages; local nickname filter plus OpenRouter only for ambiguous cases.
6. Add scoped copyright claims/reversible restrictions, audit and Telegram notifications with minimal data.
7. Add crawlable route-specific HTML, search-console integrations when access exists, end-to-end tests, rollback runbook and release review. Current SPA HTTP response fails the SEO criterion.

The roadmap's SHOULD HAVE and LATER remain deferred and unchanged. A production-ready claim requires real player, owner and admin paths in all three games, test payment/Support, copyright/restore, and SEO HTTP checks.
