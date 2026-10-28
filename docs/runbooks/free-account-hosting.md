# Free account hosting

## DECISION 28.10.2026 (owner): Cloudflare free plan, no Yandex for accounts

The owner rejected anything that can charge money. Accounts run inside the existing Cloudflare Worker on the free plan, which refuses
requests past its quotas instead of billing them (Workers: 100 000 requests/day, then Error 1027; D1: 5 M rows read and 100 000 written
per day, then queries fail — [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)).

**Pending owner edit:** `AGENTS.md` still says private data belongs to Yandex/PostgreSQL. The owner must add the exception for accounts
(the automated session was not allowed to change project rules). **Legal note:** e-mail addresses and password hashes of Russian users
are then stored outside Russia (152-FZ localisation) — an owner trade-off, not a compliance finding.

| Piece | File |
| --- | --- |
| Worker entry: `/api/v1/auth/*` → accounts app when `ACCOUNTS_FREE=true`; daily cap; hourly cleanup from the cron | `worker/accounts-free.ts`, `worker/index.ts` |
| Same app and wire contract; PBKDF2-15000 + `PASSWORD_PEPPER` (free-plan CPU budget); mail via Worker drivers (`resend`/`unisender`) | `accounts-fn/app.mjs`, `worker/lib/password.ts`, `worker/lib/mailer.ts` |
| D1 store: one atomic guarded `batch()` per operation | `accounts-fn/store-d1.mjs`, `migrations/0012_free_accounts.sql` (new tables only) |

Settings: `ACCOUNTS_FREE=true` (off by default), `ACCOUNTS_REGISTRATION_OPEN=true` (closed by default), `ACCOUNTS_DAILY_LIMIT` (default
1 500 same-site account POSTs per UTC day), secrets `PASSWORD_PEPPER` and `ACCOUNTS_RATE_KEY` (≥ 32 chars; without them the service
answers 503), mail `MAIL_DRIVER` + key + `MAIL_FROM`. At the cap the form says the free limit for today is used up; the rest of the site
is unaffected and nothing is billed.

Evidence — VERIFIED locally on workerd + local D1 (`wrangler dev --local`, migrations 0001–0012): register → link mail → confirm → cookie →
me → replay 400 → logout → wrong password 401 → login → duplicate signup gets a link-less notice → reset → old sessions revoked → old
password 401 → new password 200; forged origin 403 and not counted; daily cap 503; PBKDF2 hash stored; `wrangler deploy --dry-run`
bundle 304 KiB; `npm run test:accounts-fn` 27/27; typecheck PASS. NOT verified: production D1, the free-plan 10 ms CPU limit (local
dev does not enforce it; the earlier D1 accounts used the same PBKDF2 setting), real mail delivery.

Go-live (each step needs the owner's explicit OK; nothing done yet): (1) free mail-provider plan and its DNS records in Cloudflare;
(2) Worker secrets `PASSWORD_PEPPER`, `ACCOUNTS_RATE_KEY`, mail key; (3) apply `0012_free_accounts.sql` to production D1 (additive;
rollback = drop `acc_*`); (4) deploy with `ACCOUNTS_FREE=true`, registration closed; (5) real e-mail journey; (6) open registration.
Rollback: unset `ACCOUNTS_FREE` — the previous behaviour returns at once.

---

# Earlier analysis: Yandex Cloud Functions + serverless YDB (superseded, kept for reference)

Status on 28 October 2026: **source and local tests complete; nothing deployed, no cloud resource created, no DNS or production change.**
Live registration is still BLOCKED. This document records the audit, the official terms checked, what the cost guards can and cannot do,
what was built, and the exact approvals still needed. It does not replace [account-registration-launch.md](account-registration-launch.md)
(the existing-host path); it is the alternative that avoids the 2 300 ₽/month private host.

## 1. Audit of the current chain (verified against `origin/main` b8a138a, 28 Oct)

| Link | Finding | Status |
| --- | --- | --- |
| Form | `AccountEntry`/`Account` already hide signup when `registrationOpen` or `emailLogin` is false and keep password sign-in; fix 90d8ef9 is in `main`. | VERIFIED in source/CI |
| Browser → API | `src/hooks/useAuth.tsx` calls `GET /api/v1/auth/me`. On the primary host the Worker answers `503 private_api_required` (`worker/index.ts`, `PUBLIC_ONLY=true`): the private routes are not routed anywhere. | VERIFIED (journal, source) |
| Private API | `private-api/app.mjs` needs PostgreSQL (advisory locks, `FOR UPDATE SKIP LOCKED`, 24 migrations). The only production PostgreSQL is on `gamescout-private-d`, **Stopped** to save ≈2 300 ₽/month. | VERIFIED in console by the previous session; not re-read (no console access here) |
| Gateway | `gamescout-ru` is Active with the apex certificate attached, but primary DNS does not target it and its VMs are stopped. | per journal |
| Mail | Registration needs a delivered e-mail link. Provider drivers exist (`unisender`, `resend`, `smtp`); no provider account/DNS verification is recorded as done. | BLOCKED independent of hosting |
| Sessions | HttpOnly `gs_private_session` cookie, 7 days, SHA-256 of the token stored. Unchanged by this work. | VERIFIED in source |
| Existing data | Real accounts, if any, live only in the stopped VM's PostgreSQL (and possibly the legacy D1 `users` table). **Not read; not touched; no copy exists elsewhere.** Count unknown. | UNKNOWN — see §6 |

Not blocked by this document: public catalog, D1 projection, frontend publication.

## 2. Official terms checked (28 Oct 2026)

Numbers are from the official pages below. "Not on page" means the page does not state it; do not assume.

| Service | Free allowance | Above the allowance | Source |
| --- | --- | --- | --- |
| YDB serverless | first 1 000 000 RU/month, first 1 GB stored, 2 automatic full backups free | RU and hourly storage billed. **Conflicting list prices**: 24.64 ₽ vs 13.36 ₽ per 1 M RU on two official pages; storage 13.41 ₽/GB·month on one. Plan with the higher RU price. | [free tier](https://yandex.cloud/ru/docs/billing/concepts/serverless-free-tier), [pricing](https://yandex.cloud/ru/docs/ydb/pricing/serverless), [modes](https://yandex.cloud/ru/docs/ydb/concepts/serverless_and_dedicated) |
| Cloud Functions | 1 000 000 calls, 10 GB·h memory-time/month | 18.97 ₽/M calls + 6.48 ₽ per GB·h, 100 ms rounding; idle provisioned instances billed (we use none) | [pricing](https://yandex.cloud/ru/docs/functions/pricing) |
| API Gateway | first 100 000 requests/month | 142.3 ₽ per M requests | [pricing](https://yandex.cloud/ru/docs/api-gateway/pricing) |
| Outgoing traffic | first 100 GB/month | per-GB price not on the checked pages | [VPC pricing](https://yandex.cloud/ru/docs/vpc/pricing) |
| Postbox (e-mail) | first 2 000 letters/month; default quota 200 letters per 24 h | ≈80 ₽ per 1 000 letters from 2 001 | [pricing](https://yandex.cloud/ru/docs/postbox/pricing), [limits](https://yandex.cloud/ru/docs/postbox/concepts/limits) |
| Lockbox (secrets) | **none stated** | ≈19.7 ₽/month per secret version (0.0274 ₽ × 720 h) + 3.79 ₽ per 10 000 reads | [pricing](https://yandex.cloud/ru/docs/lockbox/pricing) |
| Cloud Logging | 5 GB written + 1 GB stored per month on the free-tier page, **but the product is closed to new clients from 22 Oct 2026** | n/a | [free tier](https://yandex.cloud/ru/docs/billing/concepts/serverless-free-tier), [logging](https://yandex.cloud/ru/docs/logging/pricing) |
| Budgets | notifications only; "reaching the threshold does not affect further consumption" | — | [budget](https://yandex.cloud/ru/docs/billing/concepts/budget) |
| Trial / starter grant | unavailable to new clients | — | [trial](https://yandex.cloud/ru/docs/billing/concepts/trial-period) |

The free tier is applied **per billing account** and unused amounts reset monthly. The 4 000 ₽ introductory grant (expires 03.11.2026) is **not** counted
as a free allowance anywhere in this plan.

## 3. Can paid overage be technically excluded? — **No, not completely**

| Dimension | Hard technical cap available? | Worst case |
| --- | --- | --- |
| YDB request units | **Yes, bounded.** Database parameter `throttling_rcu_limit` (RU/s): requests above it are rejected (`Throughput limit exceeded`). Monthly ceiling = limit × 2 572 000 s. | 1 RU/s ≈ 21–39 ₽; 3 RU/s ≈ 90–166 ₽; 5 RU/s ≈ 158–292 ₽; default 10 RU/s ≈ 330–610 ₽ (after the free 1 M RU, at 13.36–24.64 ₽ per M RU) |
| YDB storage | **Yes.** `storage_size_limit` = 1 GB: writes stop at the cap, nothing above the free 1 GB can be stored. | 0 ₽ |
| YDB provisioned capacity | Leave `provisioned_rcu_limit` = 0 (hourly billing off). | 0 ₽ |
| Postbox | Default quota 200 letters/24 h ⇒ ≤ 6 000/month. | ≈ 320 ₽ (not used by default, see §5) |
| Functions + Gateway | **No hard spend cap.** Only technical quotas (10 concurrent calls per AZ, raisable on request) and budget *notifications*. Hostile traffic is billed per request: ≈ 206 ₽ per million requests (gateway + calls + 0.05 s × 0.5 GB). | Bounded only by the concurrency quota — in theory tens of thousands of rubles per month under sustained flooding. |
| Lockbox | Optional; env variables avoid it. | 0–60 ₽ |

Consequences, in order of strength:

1. Expected cost at launch traffic (a few hundred sign-ins a month) is **0 ₽**: far below 1 M RU, 1 M calls, 100 k gateway requests and 1 GB.
2. The compute that matters most — scrypt (≈0.3–0.5 s, 512 MB) — runs only **after** the YDB-backed rate-limit check passes, so the YDB RU cap also bounds password-hashing cost.
3. What cannot be guaranteed is the *flood tail*: cheap hostile requests that never reach the database. A budget alert is advisory; an operator must disable the function/gateway route (kill switch, §7). Protecting against this tail needs either a paid shield (Smart Web Security) or a free edge in front of the origin; both are decisions for the owner.

So "0 ₽ guaranteed" is **false**; "0 ₽ expected, YDB bounded to ≤ ~170 ₽, flood tail bounded only by an alert plus manual kill switch" is the verified statement. Per the project rule, **no resource is created until the owner accepts that tail.**

## 3a. Owner requirement: "it must be free" — what can actually guarantee 0 ₽ (checked 28 Oct, afternoon)

A second reading of the official billing pages found **no documented hard zero on Yandex Cloud**:

- A personal payment account is documented both as card-less (top-up only) and as requiring a bound card at creation ([create-new-account](https://yandex.cloud/ru/docs/billing/operations/create-new-account) vs [payment-methods-individual](https://yandex.cloud/ru/docs/billing/payment/payment-methods-individual)); `PAY_OR_BIND` ("free resources and cloud creation" only) lasts until a card is bound ([statuses](https://yandex.cloud/ru/docs/billing/concepts/billing-account-statuses)). The pages contradict each other, so a card-less account is **not** a verified way to make charges impossible.
- Debt is described only for the card payment threshold; no page says what happens to Functions, API Gateway or serverless YDB at zero balance (the zero-balance cycle names VMs and database clusters), and free-tier overage is stated to be billed at tariffs ([free tier](https://yandex.cloud/ru/docs/billing/concepts/serverless-free-tier)).
- Budgets only notify; there is no spend cap (see §3).

Options that are free **by construction** or documented-free, with their price in other terms:

| Option | 0 ₽ guarantee | Data in Russia | Cost of the choice |
| --- | --- | --- | --- |
| Yandex Functions + serverless YDB (this branch) | expected 0 ₽; **not guaranteed** (§3) | yes | residual flood tail; unproven YDB store |
| Yandex in a **new card-less billing account** | UNVERIFIED — needs a 10-minute owner test (create the account without a card, try to create a YDB database and a function, read what the console allows); I cannot create accounts | yes | may be refused; behaviour at quota end unknown |
| Cloudflare Workers + D1 **free plan** | hard cap by plan terms (requests are refused, not billed; LIKELY, terms not re-read here) | **no** — breaks the owner's Russia-storage decision and the `AGENTS.md` boundary (private data = Yandex/PostgreSQL); reuses the retired D1 accounts code; D1 free read limits already caused one outage | needs an explicit change of the data boundary |
| Owner's own PC in Russia (private API + Postgres/SQLite, outbound-only tunnel) | hard 0 ₽ | yes | account sign-in is down when the PC is off; owner must secure, patch and back it up; DNS approval still needed |
| Fixed-price Russian host (e.g. Amvera 580–980 ₽/30 days list price) | fixed, not free | yes | not free |

No option is selected and nothing was created.

## 4. What was built (local, 0 ₽)

`accounts-fn/` — an accounts-only API with the same wire contract as `private-api/app.mjs` for exactly these routes: `GET /api/v1/health`,
`GET /api/v1/auth/me`, `POST /api/v1/auth/{register, register/confirm, login, password/reset/request, password/reset, logout}`
(cookie `gs_private_session`, 20-minute single-use links, 7-day sessions, scrypt hashes, CSRF origin check, 16 KB body cap, per-address and per-IP limits,
emergency mode, closed-by-default signup). Everything else under `/api/v1` is a JSON 404 `route_unavailable` (also at the gateway).

| File | Purpose |
| --- | --- |
| `accounts-fn/app.mjs` | Hono app + store contract (documented at the top) |
| `accounts-fn/store-memory.mjs` | Reference store used by tests |
| `accounts-fn/store-ydb.mjs`, `schema.mjs`, `migrate.mjs` | Serverless-YDB store (classic Table API, `withSessionRetry`, one serializable transaction per operation), tables with TTL, explicit `--apply` migration (dry-run by default) |
| `accounts-fn/handler.mjs`, `build.mjs` | API Gateway v1.0 event adapter (`index.handler`), esbuild bundle → `accounts-fn/dist` |
| `ru-proxy/yandex/gateway.accounts-fn.template.yaml` | Unapplied gateway candidate: only `/api/v1/health` and `/api/v1/auth/*` reach the function; all other private routes fail closed; catalog routes unchanged. Generated by `node scripts/yandex-private-gateway.mjs --accounts --write` |
| `tests/accounts-fn*.test.mjs`, `tests/accounts-gateway.test.mjs` | 19 tests, `npm run test:accounts-fn` (also in CI) |

Evidence level:

- **VERIFIED locally:** all 19 tests pass; the route-level behaviour (register→mail link→verify→session→logout→login→recovery, single use, expiry, replacement of older links, concurrency, closed/omitted registration, mail-disabled and emergency refusal, rate limits, origin/size/type guards, generic 500, cookie in `multiValueHeaders`) against the reference store; gateway spec generation and route coverage; the bundle builds and loads.
- **HYPOTHESIS (not executed):** `store-ydb.mjs`, `schema.mjs`, `migrate.mjs` against a real YDB (YQL syntax, TTL clause, `INNER JOIN` forms, session-retry behaviour, metadata credentials with `YDB_METADATA_CREDENTIALS=1`, RU consumption per operation). Docker was not running and no YDB endpoint was available. The same store contract test runs against YDB unchanged when `YDB_TEST_ENDPOINT`/`YDB_TEST_DATABASE` are set (see the header of `tests/accounts-fn-store.test.mjs`). ydb-sdk row mapping (snake_case names, `Date` timestamps, `int32`) was checked offline.
- **BLOCKED:** live function/gateway behaviour, the gateway parser, delivered e-mail, real RU cost per login.

Known behaviour differences from the PostgreSQL core (by design):

- The letter is sent after the database commit and **not queued**: a failed send is logged (no address/token) and the person asks again (limit 5 per hour). A YDB outbox plus timer trigger would restore at-least-once delivery.
- Because the send is inline, an address that already has an account (registration) or has none (recovery) receives a **link-less notice** instead of silence, so response time and mail count do not reveal whether an account exists. This is an addition to the PostgreSQL core's wording; it needs the owner's approval of the notice text (`noticeMail` in `accounts-fn/handler.mjs`).
- Roles are always `PLAYER`, OAuth providers are empty, `/me/email` change is absent.
- After sign-in the cabinet page also requests `/owners/me/claims`, `/owners/me/servers` and `/coins/me`; they answer `route_unavailable`, so the cabinet shows an error line for those panels until the private core returns. The frontend was **not** changed (design is approved). Votes, Claims, Coins and payments stay unavailable.

## 5. Mail

Registration is not possible without a sender. Existing drivers work in the function unchanged (`MAIL_DRIVER`):

| Option | Free | Needs |
| --- | --- | --- |
| `smtp` with a Yandex mailbox | yes (provider limits apply, not verified here) | a mailbox owned by the project and an **app password**; sender = the mailbox; no DNS change |
| `unisender` (planned in `go-live-checklist.md`) | free-plan limits not verified here | account + DNS records for `gamescout.online` (owner action) |
| Yandex Cloud Postbox | 2 000 letters/month | DKIM/SPF DNS records for the sender domain; the verified SMTP endpoint is `postbox.cloud.yandex.net:587` with STARTTLS, which `private-api/smtp.mjs` does **not** implement yet (it does implicit TLS only) |

Any DNS record on `gamescout.online` is a DNS change and needs the explicit approval required by `AGENTS.md`.

## 6. Existing data and the old host

- Nothing was started, copied or deleted. The stopped `gamescout-private-d` disk remains the only copy of any existing accounts.
- To carry existing users over, the owner must approve a **bounded start** of that VM (roughly 3 ₽/hour at the quoted 2 300 ₽/month; disk/IP charges continue regardless), a `pg_dump` of `gs_users`, `gs_identities` and `gs_user_roles` only, and a one-off import script. Password hashes use the same `scrypt$131072$8$1$…` format, so users would not need to reset passwords. This script is not written because it needs access that is not available here.
- Without that step the new store starts empty: previously registered people could not sign in and would have to register again.

## 7. Resource plan (NOT executed) and kill switch

Intended settings; every value must be re-read against the console before use (`yc` is not installed here, so CLI flags are unverified):

1. YDB serverless database in `ru-central1`: `throttling_rcu_limit` **3–5 RU/s** (enable the throttle), `storage_size_limit` **1 GB**, `provisioned_rcu_limit` 0. Apply `node accounts-fn/migrate.mjs --apply` once.
2. Service account `accounts-fn` with only `ydb.editor` on that database; service account `accounts-gateway` with only `functions.functionInvoker` on the function. No keys exported; the function uses the metadata token.
3. Function `gamescout-accounts` (runtime `nodejs22`, entrypoint `index.handler`, **512 MB**, timeout 20 s, 0 provisioned instances), environment: `YDB_ENDPOINT`, `YDB_DATABASE`, `YDB_METADATA_CREDENTIALS=1`, `PUBLIC_ORIGIN=https://gamescout.online`, `RATE_HASH_KEY` (random ≥ 32 chars), mail variables, **`REGISTRATION_OPEN` unset (closed)**. Secrets in plain environment variables are readable by anyone with folder access; Lockbox costs ≈ 20 ₽/month per secret version — owner's choice.
4. A copy of the gateway spec with placeholders replaced **outside Git**, validated on an isolated gateway first.
5. Budget alert at a low threshold (e.g. 100 ₽) — advisory only.
6. **Kill switch:** (a) set `EMERGENCY_MODE=true` (writes refused, sign-in still works); (b) remove the two accounts routes from the gateway or delete the function version; (c) restore the saved gateway spec. All reversible; data in YDB is untouched.

## 8. Approvals still needed (separate, concrete)

1. **Accept the cost-model** in §3 (expected 0 ₽, YDB bounded, flood tail only alert + kill switch) **or** choose a shield / paid alternative.
2. **Create the resources** in §7 in the owner's billing account (under `AGENTS.md`: needs the concrete result and rollback plan above).
3. **DNS:** the apex must reach the gateway for the cookie/route model to work. The runbook forbids tunnelling private requests through the public D1 Worker. A concrete snapshot/candidate/rollback must be prepared from the live zone and approved before any change.
4. **Mail sender** (§5) and any DNS records it needs.
5. **Existing users** (§6): bounded VM start + export, or start empty.
6. **Docker/local YDB**: permission to download the `ydbplatform/local-ydb` image (size not verified) to run the store contract against a real YDB before step 2.

## 9. Acceptance after approvals (do not skip)

1. Store contract test against a disposable YDB; record RU used per operation and size the throttle from the measurement.
2. Deploy to an isolated gateway; check `GET /api/v1/health`, `auth/me`, forged-origin refusal, `Set-Cookie`, client IP, an unrouted private path (404 JSON), a forged `/__internal/*` request (404).
3. Controlled journey with a project-owned mailbox: signup request → delivered e-mail → one-use confirmation → cookie → logout/login → recovery → replayed/expired link refused → old sessions revoked. Real mail, not logs.
4. Visual check of the account page at 320/390/768/1024/1440 px and landscape in L2, Minecraft and GTA RP contexts, including the cabinet error line.
5. Only then open `REGISTRATION_OPEN=true` and propose the DNS change.

Rollback: set `REGISTRATION_OPEN` unset; restore the previous gateway spec/DNS; keep the YDB database and its backups.
