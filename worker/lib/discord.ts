/**
 * Discord sign-in (OAuth 2 authorization code, scope `identify` only).
 *
 * The only production login. Enabled when DISCORD_CLIENT_ID and
 * DISCORD_CLIENT_SECRET are set; the redirect URI is derived from
 * ALLOWED_ORIGIN and must be registered in the Discord application exactly:
 *   https://gamescout.online/api/v1/auth/discord/callback
 *
 * Nothing but the Discord user id, display name and avatar is read — no email.
 */
import type { Env } from './core.ts'

export interface DiscordProfile {
  id: string
  displayName: string
  avatarUrl?: string
}

export const discordEnabled = (env: Env) => !!env.DISCORD_CLIENT_ID && !!env.DISCORD_CLIENT_SECRET && !!env.ALLOWED_ORIGIN

/** The API base can be pointed at a local fixture only in development. */
function apiBase(env: Env): string {
  return env.ENVIRONMENT === 'development' && env.DISCORD_API_BASE ? env.DISCORD_API_BASE.replace(/\/$/, '') : 'https://discord.com/api'
}
function authorizeBase(env: Env): string {
  return env.ENVIRONMENT === 'development' && env.DISCORD_API_BASE ? apiBase(env) + '/oauth2/authorize' : 'https://discord.com/oauth2/authorize'
}

export const redirectUri = (env: Env) => `${env.ALLOWED_ORIGIN!.replace(/\/$/, '')}/api/v1/auth/discord/callback`

export function authorizeUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.DISCORD_CLIENT_ID!,
    scope: 'identify',
    state,
    redirect_uri: redirectUri(env),
    prompt: 'none',
  })
  return `${authorizeBase(env)}?${params.toString()}`
}

/** Exchanges the code and reads the profile. Throws on any failure; the caller shows a generic error. */
export async function discordProfile(env: Env, code: string): Promise<DiscordProfile> {
  const base = apiBase(env)
  const token = await fetch(`${base}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID!,
      client_secret: env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(env),
    }),
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  })
  if (!token.ok) throw new Error(`discord_token_${token.status}`)
  const { access_token: accessToken, token_type: tokenType } = (await token.json()) as { access_token?: string; token_type?: string }
  if (!accessToken) throw new Error('discord_token_missing')

  const me = await fetch(`${base}/users/@me`, {
    headers: { Authorization: `${tokenType ?? 'Bearer'} ${accessToken}`, Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  })
  if (!me.ok) throw new Error(`discord_user_${me.status}`)
  const user = (await me.json()) as { id?: string; username?: string; global_name?: string | null; avatar?: string | null }
  if (!user.id || !/^\d{5,25}$/.test(user.id)) throw new Error('discord_user_invalid')
  const displayName = String(user.global_name || user.username || 'Discord user').slice(0, 60)
  return {
    id: user.id,
    displayName,
    avatarUrl: user.avatar && /^[a-f0-9_]{8,64}$/.test(user.avatar) ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : undefined,
  }
}

/** Only same-site relative paths may be returned to after sign-in. */
export function safeNext(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && value.length < 300 ? value : '/dashboard'
}
