# TOP-3 release on the actual canonical frontend

Approved design: `ea7722911de8268348a2c75934c1785ad2a7dfd3`, already in main. Source checkout: `output/top3-release-20261012`, PR #15. Do not deploy the stale root checkout.

## Verified cause and scope

Canonical DNS resolves Cloudflare. Canonical homepage and unknown route matched the existing emergency Worker HTML/JS (`index-D1_3L5Kw.js`, 8314 bytes). Its active version was `bea24bb2-97dd-42c6-8b91-e77fc8d166a1` at 100%. The Yandex-only workflow could not update that immutable Worker asset bundle. SPA fallback returned the homepage with 200 for missing routes.

Three Yandex CLI reads (list, known gateway get, get-spec) timed out. No active specification backup could be obtained. No repository template is asserted to be deployed; no Gateway, DNS, API, private SQL, OAuth settings or SMTP changes were made.

Owner selected the existing Cloudflare frontend path, preserving Supabase and DNS. Add an explicit manual `cloudflare-frontend` target to the existing protected `deploy-production.yml`; existing Yandex push/default behavior remains. A proposal to persist future targeting was rejected by automatic approval review and removed, not bypassed.

## Minimal static routing correction

```diff
- not_found_handling = "single-page-application"
+ not_found_handling = "404-page"
+ html_handling = "none"
```

The Worker maps extensionless pages to the actual `path/index.html`; absent objects serve `404.html` at HTTP 404 with noindex/no-store. Private denial and public read-only service binding are preserved byte-for-byte. Supabase frontend integration is copied from the already live release, retaining project/session storage/callback handling; no SQL bridge is added in this release.

HTML responses use `no-store, must-revalidate`. Explicit Worker-first patterns handle documents consistently; `/assets/*` and `/media/*` serve directly, preserving nosniff through `_headers` and reducing billable invocations. Before upload, the release keeps the currently published public hashed JS/CSS/font graph in the new asset manifest. It never copies old HTML, never overwrites different bytes under a current hash, and rejects HTML fallbacks, more than128 dependencies or more than8MiB. The real initial graph contained33 files/1.35MB. Bundle safety still scans all files for fixtures/readable old brand, and separately checks the actual current graph for duplicate migration keys.

## Gates and rollback

Protected workflow runs private tests, public read tests, actual catalog build/SEO reconciliation, bundle check and all nine browser suites. It snapshots the active version, uploads an inactive candidate, verifies its HTTP SEO including unknown 404, refuses activation if another release changed the active version, then activates only that version. Canonical SEO and all nine live browser suites follow; failure restores the saved active version and fails the run.

Before canonical SEO, a bounded120-second readiness check requires the new entry JS in the homepage, L2 and account slash/no-slash aliases, Minecraft and GTA RP, plus the exact missing-route404/noindex. This does not replace the unchanged SEO test or any live browser suite. A successful manual matrix alone does not override a failed automated postflight. Runs38278196034 and38281655931 exercised actual automatic rollback; rollback root HTML/entry JS availability was independently checked afterwards.

Manual emergency rollback (run only if no other release replaced this candidate):

```powershell
npx wrangler versions deploy bea24bb2-97dd-42c6-8b91-e77fc8d166a1@100 --config wrangler.emergency-preview.toml --yes
```

No new resources or paid plan. Existing Worker/GitHub operations only. UI fix restores portraits to absolute positioning, 64–65px rows, header/favorite clearance and light-theme contrast. Artwork is indexed by place; counter sources and sorting remain unchanged. Live ranking availability is a separate private-service limitation, not a fabricated counter.

## Actual local matrix

320×568, 390×844, 768×1024, 1024×768, 1440×900, 844×390; dark and light, both L2 shelves. Six rank cards per case; no horizontal overflow, text/counter/favorite collisions or portrait/header collision. Mobile height64, others65. Light contrast readback verified all six widths. Proofs: ignored `output/top3-qa/`.

Production results must be recorded in core-progress.md and Issue #14; an inactive upload or successful merge is not production verification.
