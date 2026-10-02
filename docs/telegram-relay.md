# Telegram technical relay — 01.10.2026

**VERIFIED production:** Yandex VM → existing gamescout-origin Worker → Telegram sendMessage, recovery event delivered1/pending0. Telegram API accepted the notification for the fixed owner chat; owner reading it is not technically observable. No new Worker/VPS/subscription; normal existing free-tier usage. User authentication via Telegram is not implemented or requested.

Transport uses the existing projection secret between the same trusted VM and Worker. Bot token and fixed recipient are Worker secret bindings; the model and event DTO never receive them. Private outbox retries/leases remain in PostgreSQL. Relay writes no incident/person data to D1.

Allowlisted DTO has exactly `event` (one of22 fixed technical categories) and `eventRef` (internally generated opaque16–64 characters). No names/email/IP/evidence/request body/free text/destination/token. Private central firewall validates first; Worker validates again and constructs a fixed message. Token-containing fetch errors and Telegram response bodies never enter application logs/responses.

Reality Check: first deployment failed because Node supports `redirect:error`, while workerd rejects it before network I/O. A local real-workerd reproduction with completely intercepted outbound confirmed the defect; corrected to `manual`, rejecting3xx. A real-workerd regression test now runs in `npm run test:private`. Three bounded diagnostics were followed by a concrete local code correction rather than more unchanged network attempts.

Worker active version:65f87f90-fa3f-4a90-aee6-75f9b4c3a90a. Source/config backups on VM: `/home/spl23071994/before-telegram-relay.tar`, image `vm-api:before-telegram-relay`, protected `deploy/vm/.env.telegram-relay-before`. Prior Worker version:edf4aa73-97d8-41d9-972c-6a77805ff24a.

## Rollback

Remove only TELEGRAM_RELAY_URL from existing VM `.env` (preserve other configuration, mode600); API-only recreate. Then restore prior Worker version with `npx wrangler rollback edf4aa73-97d8-41d9-972c-6a77805ff24a --config ru-proxy/wrangler.origin.toml`. If reverting the API implementation, restore source tar and image before rebuilding. Do not reset delivered jobs or old stopped attempts. Direct VM→Telegram remains network-blocked, so rollback means delivery stops, not a working alternate channel.

No VM secrets were exported to stdout. Initial credential extraction was rejected by automatic review and did not run. Revised separately-approved transport read the previously owner-created local token file, identified exactly one private `/start` recipient via the fixed Bot API, and passed values through memory/stdin to Wrangler. Values are not in Git/docs/tool output.

## Limits

- Relay delivery is at-least-once: a lost ACK can duplicate an alert. Technical notifications are not financial transactions.
- Existing projection secret authenticates both internal endpoints; rotate both sides together if compromised. Keep it out of future AI context/tools.
- Unknown categories require a reviewed code change at both egress boundaries.
- No German VPS fallback needed after successful Cloudflare delivery. No autonomous fixes/deploy rights granted to AI.
