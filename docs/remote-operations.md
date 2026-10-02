# Remote operations from ChatGPT/GitHub

Goal: owner can manage GameScout from a phone; local PC is not required for routine code releases.

## VERIFIED now

Static frontend production deploy is already connected:
GitHub -> tests/build -> backup -> Yandex Object Storage -> live checks -> rollback on failure.

## Cloudflare Worker / D1

Repository workflow: `.github/workflows/deploy-cloudflare.yml`.

One-time GitHub Actions secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The token should be limited to the GameScout Cloudflare account/zone and existing Worker deployment. The production Worker route already exists. The workflow does not apply D1 migrations.

D1 schema changes remain a separate reviewed production action. Do not combine an irreversible migration with an ordinary Worker release.

## Yandex private VM

Repository workflow: `.github/workflows/check-yandex-vm.yml`.

It is deliberately read-only. We first verify the real VM path, Docker Compose project and API health before writing a deploy workflow.

Repository-observed defaults used by the read-only workflow:
- host: `priv.gamescout.online`
- user: `spl23071994`
- deploy path: `/home/spl23071994/gamescout-staging`

One-time GitHub Actions secrets:
- `VM_SSH_PRIVATE_KEY`
- `VM_SSH_KNOWN_HOSTS`

Before adding them, verify from the existing operator PC that `ssh -o BatchMode=yes spl23071994@priv.gamescout.online "echo OK"` succeeds. Then copy the existing private key to GitHub without posting it in chat. Copy the already trusted `priv.gamescout.online` entry from the local `known_hosts`; do not accept a new host key from GitHub Actions for the first production connection.

Use a dedicated deploy key/user where practical. Do not put a private key in Markdown, code, issue comments or chat.

After the read-only check passes, create the production VM deploy workflow from the observed layout. It must preserve `.env`, PostgreSQL TLS files and Docker volumes, create a fresh database/source rollback point, deploy only API/proxy code, health-check, and auto-rollback source/image on failure. Production DB migrations stay a separate approval.

## Boundaries

Routine source changes may be automated. DNS, IAM expansion, real payment activation, destructive data operations and production database migrations remain explicit owner-approved actions.
