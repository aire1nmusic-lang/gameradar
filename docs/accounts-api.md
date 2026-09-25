# Accounts, cabinet and admin — API contract

All paths under `/api/v1`. JSON bodies; errors are `{ "error": { "code", "message" } }` with a Russian `message` ready to show.
Sessions are the existing HttpOnly cookie `gs_session` (30 days). Writes need `Origin` to be a site origin (already enforced).

## Types

```ts
type Provider = 'google' | 'yandex' | 'vk' | 'discord'
type Role = 'PLAYER' | 'OWNER' | 'ADMIN'

type User = {
  id: string
  displayName: string
  email?: string
  emailVerified: boolean
  avatarUrl?: string
  roles: Role[]
  hasPassword: boolean
  identities: { provider: Provider; linkedAt: string }[]
  createdAt: string
}
```

## Session and sign-in

| Method | Path | Body | Answer |
| --- | --- | --- | --- |
| GET | `/auth/me` | — | `{ user: User \| null, providers: Provider[], emailLogin: boolean, devAuthEnabled: boolean }` — `providers` lists only configured ones; `emailLogin` is false until mail is configured |
| POST | `/auth/register` | `{ email, password, displayName }` | 202 `{ sent: true, email, expiresInSec }` — a 6-digit code is mailed. 409 `email_taken` if a verified account exists |
| POST | `/auth/register/confirm` | `{ email, code }` | 200 `{ user }` + session. 400 `code_invalid` / `code_expired`, 429 `too_many_attempts` |
| POST | `/auth/login` | `{ email, password }` | 200 `{ user }` + session. 401 `invalid_credentials`. 403 `email_unverified` with `{ sent: true }` (a confirmation code was mailed) |
| POST | `/auth/code` | `{ email, purpose: 'login' \| 'reset' }` | 202 `{ sent: true, expiresInSec }` — always, so the answer does not reveal whether the email exists. 429 `rate_limited` |
| POST | `/auth/code/verify` | `{ email, code }` | 200 `{ user }` + session (sign-in by code) |
| POST | `/auth/password/reset` | `{ email, code, password }` | 200 `{ user }` + session |
| GET | `/auth/:provider?next=/path` | — | 302 to the provider. Back on `next`, or `next?auth_error=<provider>` on failure |
| GET | `/auth/:provider?link=1&next=/account` | — | Links the provider to the signed-in user instead of signing in |
| POST | `/auth/logout` | — | 204 |

Passwords: 8–128 characters. Codes: 6 digits, valid 15 minutes, 5 attempts, at most 5 codes per email per hour.
Display name: 2–40 characters.

## Account (cabinet)

| Method | Path | Body | Answer |
| --- | --- | --- | --- |
| PATCH | `/me` | `{ displayName }` | `{ user }` |
| POST | `/me/password` | `{ currentPassword?, newPassword }` | `{ user }` — `currentPassword` required when `hasPassword` |
| DELETE | `/me/identities/:provider` | — | `{ user }`; 409 `last_login_method` if it is the only way to sign in |

## Server logos (owners)

| Method | Path | Body | Answer |
| --- | --- | --- | --- |
| POST | `/servers/:id/logo` | raw bytes, `Content-Type: image/webp \| image/png \| image/jpeg`, ≤ 150 KB, square, ≥ 64 px | 201 `{ logo: { id, status: 'PENDING', createdAt } }`. Only the verified owner of the server |
| GET | `/servers/:id/logo` | — | `{ current?: { id, url }, pending?: { id, createdAt }, rejected?: { id, reason, reviewedAt } }` (owner) |
| GET | `/logos/:id` | — | image bytes of an approved logo, cached for a year |

An approved logo becomes `server.logoUrl = /api/v1/logos/<id>`; `ServerLogo` already prefers it over the default icon.
The browser should resize to 256×256 WebP before upload (canvas), so uploads stay small.

## Admin (role ADMIN)

| Method | Path | Body | Answer |
| --- | --- | --- | --- |
| GET | `/admin/overview` | — | `{ pendingLogos, pendingServers, pendingClaims, users }` |
| GET | `/admin/logos?status=PENDING` | — | `[{ id, status, createdAt, size, mime, server: { id, slug, name, gameId }, uploadedBy: { id, displayName, email } }]` |
| GET | `/admin/logos/:id/image` | — | bytes (any status) |
| POST | `/admin/logos/:id/approve` | — | `{ ok: true }` |
| POST | `/admin/logos/:id/reject` | `{ reason }` | `{ ok: true }` |
| GET | `/admin/servers?status=PENDING` | — | `[{ server: GameServer, moderation, submittedBy?: { id, displayName, email }, createdAt }]` |
| POST | `/admin/servers/:id/publish` | — | existing |
| POST | `/admin/servers/:id/reject` | `{ reason }` | `{ ok: true }` |
| GET | `/admin/claims?status=PENDING` | — | `[{ id, status, method, createdAt, server: { id, slug, name }, user: { id, displayName, email } }]` |
| GET | `/admin/users?query=` | — | `[{ id, displayName, email, roles, createdAt, lastLoginAt, bannedAt, identities }]` (max 100) |
| POST | `/admin/users/:id/roles` | `{ roles: Role[] }` | `{ ok: true }` |
| POST | `/admin/users/:id/ban` | `{ banned: boolean }` | `{ ok: true }` |

Admins are the accounts whose verified email is listed in the Worker variable `ADMIN_EMAILS`, plus anyone given the role in the admin page.
