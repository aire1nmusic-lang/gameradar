# Reopen accounts on the existing private host

Status on 28 October 2026: **BLOCKED for live launch**. Public frontend publication is independent from account availability. The owner requested normal registration, but had previously explicitly paused compute to save money. Do not silently cancel that instruction.

## Verified starting point

- Actual primary anonymous `/api/v1/health` returns200; `/api/v1/auth/me` returns503 `private_api_required`.
- The existing `gamescout-private-d` and old staging VM both showStopped in the signed-in Yandex console. The production private API and PostgreSQL need a running private host. No new database or alternate provider has been approved.
- The existing `gamescout-ru` API Gateway isActive and already has the apex domain/certificate attached. An attachment is not evidence of current DNS routing or successful private API transport. Its service-host health/session requests timed out during this check.
- Existing code has encrypted transactional mail, one-use20minute confirmation/reset links, scrypt password hashes, HttpOnly/Secure/SameSite sessions, explicit production signup policy and CSRF origin checks. Neither test fixtures nor provider configuration prove real email delivery.
- GitHub frontend publication credentials do not establish private VM SSH access. Previously missing VM credentials must not be assumed restored, guessed or auto-enrolled. Use the existing authorized operator access, preserving host-key verification and secret handling.

## Execution after the running-cost decision

1. Obtain the owner's decision to resume the existing private host at its displayed running cost. Record the scope and duration privately; no account balance, cloud credentials or financial account details belong in this public repository. Keep the old staging VMStopped.
2. Start only the existing production private host. Verify PostgreSQL/API/proxy health and maintenance/mail delivery, without opening registration yet. A failed health check does not authorize changing IAM, security groups, credentials or database ownership.
3. Read the actual deployed revision, pending migration plan and registration/emergency/provider configuration without logging secret values. Make and verify a fresh encrypted backup before any private-schema change. No implicit migration or database reset; irreversible migrations need separate approval.
4. Test private ingress independently. Verify the exact trusted IP path, anti-CSRF rejection, anonymous session JSON, no-store headers, HTTPS and the existing email queue/maintenance path. Keep payments disabled. If current private access is blocked, stop with evidence rather than blindly restarting services or extending access.
5. Prepare the exact current primary DNS/domain/route snapshot and proposed change, including release-workflow compatibility and rollback. **Production DNS requires separate approval of that concrete candidate under AGENTS.md.** Do not move private requests through the public D1 Worker as a workaround or switch the apex on the strength of a gateway-domain attachment alone.
6. After verified ingress and mail, enable the existing explicit `REGISTRATION_OPEN=true` only in the private API configuration. Recreate only the API when required; retain the database volume, secret files and backups. `EMERGENCY_MODE` must remain an observed operator setting, not silently bypassed.
7. Accept an authorized controlled account journey: request signup, actual delivered email, one-use confirmation, authenticated cookie, logout/login, password recovery, expired/replayed token refusal and old-session revocation. Credential/email-token entry stays in the secure user flow. Do not invent delivery or create arbitrary real users. Verify main-domain behavior in L2, Minecraft and GTA contexts, including320/390/768/1024/1440px and landscape. OAuth providers are accepted individually only after their real callbacks work.

## Rollback and acceptance limits

- First close new signup (`REGISTRATION_OPEN=false`) while retaining existing user data. Preserve database/outbox/audit and encrypted backups.
- Restore exact saved DNS/domain/route state if a routing change fails. Do not delete accounts, database volumes, IPs, disks or archives.
- If the owner chose a bounded diagnostic start, stop the same VM after the agreed interval and verifyStopped. Explain that account service is then unavailable again. Existing storage/IP charges are separate from running compute.
- The public site must remain usable throughout. A successful build, a healthy public catalog, synthetic mail or source merged into main is **not** live registration acceptance.

Source acceptance for the current capability correction: PR25, commit90d8ef95; local private suite68/68, gateway7/7, typecheck/catalog build/SEO reconciliation/bundle passed. Full CI40734650026 also checks the disposable PostgreSQL restore and six-size browser matrix; read its terminal result and screenshots before claiming visual acceptance.
