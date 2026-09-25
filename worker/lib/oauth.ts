/**
 * Sign-in with Google, Yandex, VK ID and Discord (OAuth 2 authorization code).
 *
 * A provider is on when its keys are set as Worker secrets:
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *   YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET
 *   VK_CLIENT_ID (+ optional VK_CLIENT_SECRET; VK ID uses PKCE)
 *   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
 * The redirect URI registered at each provider is
 *   https://gamescout.online/api/v1/auth/<provider>/callback
 * derived from ALLOWED_ORIGIN.
 *
 * Only the account id, name, avatar and email (when the person allows it) are
 * read. In development OAUTH_TEST_BASE points every provider at a local fixture.
 */
import type { Env } from './core.ts'

export type Provider = 'google' | 'yandex' | 'vk' | 'discord'
export const PROVIDERS: Provider[] = ['google', 'yandex', 'vk', 'discord']

export interface OAuthProfile {
  id: string
  displayName: string
  avatarUrl?: string
  email?: string
  /** the provider vouches that the email belongs to this person */
  emailVerified: boolean
}

export const isProvider = (value: string): value is Provider => (PROVIDERS as string[]).includes(value)

export function providerEnabled(env: Env, provider: Provider): boolean {
  if (!env.ALLOWED_ORIGIN) return false
  switch (provider) {
    case 'google': return !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET
    case 'yandex': return !!env.YANDEX_CLIENT_ID && !!env.YANDEX_CLIENT_SECRET
    case 'vk': return !!env.VK_CLIENT_ID
    case 'discord': return !!env.DISCORD_CLIENT_ID && !!env.DISCORD_CLIENT_SECRET
  }
}

export const enabledProviders = (env: Env) => PROVIDERS.filter(p => providerEnabled(env, p))

export const redirectUri = (env: Env, provider: Provider) => `${env.ALLOWED_ORIGIN!.replace(/\/$/, '')}/api/v1/auth/${provider}/callback`

const REAL = {
  google: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', profile: 'https://openidconnect.googleapis.com/v1/userinfo' },
  yandex: { authorize: 'https://oauth.yandex.ru/authorize', token: 'https://oauth.yandex.ru/token', profile: 'https://login.yandex.ru/info?format=json' },
  vk: { authorize: 'https://id.vk.com/authorize', token: 'https://id.vk.com/oauth2/auth', profile: 'https://id.vk.com/oauth2/user_info' },
  discord: { authorize: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token', profile: 'https://discord.com/api/users/@me' },
} as const

/** Real endpoints in production; a local fixture only in development. */
function endpoints(env: Env, provider: Provider) {
  const dev = env.ENVIRONMENT === 'development'
  if (dev && provider === 'discord' && env.DISCORD_API_BASE) {
    const base = env.DISCORD_API_BASE.replace(/\/$/, '')
    return { authorize: `${base}/oauth2/authorize`, token: `${base}/oauth2/token`, profile: `${base}/users/@me` }
  }
  if (dev && env.OAUTH_TEST_BASE) {
    const base = `${env.OAUTH_TEST_BASE.replace(/\/$/, '')}/${provider}`
    return { authorize: `${base}/authorize`, token: `${base}/token`, profile: `${base}/profile` }
  }
  return REAL[provider]
}

/** PKCE: VK ID requires it; the verifier travels in the short-lived OAuth cookie. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function authorizeUrl(env: Env, provider: Provider, state: string, verifier: string): Promise<string> {
  const base = endpoints(env, provider).authorize
  const common = { response_type: 'code', state, redirect_uri: redirectUri(env, provider) }
  let params: Record<string, string>
  switch (provider) {
    case 'google':
      params = { ...common, client_id: env.GOOGLE_CLIENT_ID!, scope: 'openid email profile', prompt: 'select_account' }
      break
    case 'yandex':
      params = { ...common, client_id: env.YANDEX_CLIENT_ID! }
      break
    case 'vk':
      params = { ...common, client_id: env.VK_CLIENT_ID!, scope: 'email', code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256' }
      break
    case 'discord':
      params = { ...common, client_id: env.DISCORD_CLIENT_ID!, scope: 'identify email', prompt: 'none' }
      break
  }
  return `${base}?${new URLSearchParams(params).toString()}`
}

async function postForm(url: string, form: Record<string, string>, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
    body: new URLSearchParams(form),
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`oauth_token_${response.status}`)
  return (await response.json()) as Record<string, unknown>
}

async function getJson(url: string, authorization: string) {
  const response = await fetch(url, { headers: { Authorization: authorization, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`oauth_profile_${response.status}`)
  return (await response.json()) as Record<string, unknown>
}

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const cleanName = (value: string | undefined, fallback: string) => (value ?? fallback).replace(/\s+/g, ' ').slice(0, 40)
const cleanEmail = (value: unknown) => {
  const email = str(value)?.toLowerCase()
  return email && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(email) ? email : undefined
}

/** Exchanges the code and reads the profile. Throws on any failure; the caller shows a generic error. */
export async function exchangeProfile(env: Env, provider: Provider, code: string, query: URLSearchParams, verifier: string): Promise<OAuthProfile> {
  const urls = endpoints(env, provider)
  const redirect = redirectUri(env, provider)
  switch (provider) {
    case 'google': {
      const t = await postForm(urls.token, { grant_type: 'authorization_code', code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirect })
      const access = str(t.access_token)
      if (!access) throw new Error('oauth_token_missing')
      const p = await getJson(urls.profile, `Bearer ${access}`)
      const id = str(p.sub)
      if (!id || id.length > 64) throw new Error('oauth_profile_invalid')
      return { id, displayName: cleanName(str(p.name), 'Игрок Google'), avatarUrl: str(p.picture), email: cleanEmail(p.email), emailVerified: p.email_verified === true }
    }
    case 'yandex': {
      const t = await postForm(urls.token, { grant_type: 'authorization_code', code, client_id: env.YANDEX_CLIENT_ID!, client_secret: env.YANDEX_CLIENT_SECRET! })
      const access = str(t.access_token)
      if (!access) throw new Error('oauth_token_missing')
      const p = await getJson(urls.profile, `OAuth ${access}`)
      const id = str(p.id) ?? (typeof p.id === 'number' ? String(p.id) : undefined)
      if (!id || id.length > 64) throw new Error('oauth_profile_invalid')
      const avatarId = str(p.default_avatar_id)
      return {
        id,
        displayName: cleanName(str(p.display_name) ?? str(p.real_name) ?? str(p.login), 'Игрок Яндекса'),
        avatarUrl: avatarId && p.is_avatar_empty !== true ? `https://avatars.yandex.net/get-yapic/${encodeURIComponent(avatarId)}/islands-200` : undefined,
        email: cleanEmail(p.default_email),
        // Yandex hands out only the account's confirmed address.
        emailVerified: !!cleanEmail(p.default_email),
      }
    }
    case 'vk': {
      const deviceId = query.get('device_id') ?? ''
      const t = await postForm(urls.token, {
        grant_type: 'authorization_code', code, code_verifier: verifier, client_id: env.VK_CLIENT_ID!, device_id: deviceId,
        redirect_uri: redirect, state: query.get('state') ?? '', ...(env.VK_CLIENT_SECRET ? { client_secret: env.VK_CLIENT_SECRET } : {}),
      })
      const access = str(t.access_token)
      if (!access) throw new Error('oauth_token_missing')
      const info = await postForm(urls.profile, { client_id: env.VK_CLIENT_ID!, access_token: access })
      const u = (info.user ?? {}) as Record<string, unknown>
      const id = str(u.user_id) ?? (typeof u.user_id === 'number' ? String(u.user_id) : undefined)
      if (!id || !/^\d{1,20}$/.test(id)) throw new Error('oauth_profile_invalid')
      const name = [str(u.first_name), str(u.last_name)].filter(Boolean).join(' ')
      // VK does not state whether the address was confirmed: it never links accounts by email.
      return { id, displayName: cleanName(name || undefined, 'Игрок VK'), avatarUrl: str(u.avatar), email: cleanEmail(u.email), emailVerified: false }
    }
    case 'discord': {
      const t = await postForm(urls.token, { client_id: env.DISCORD_CLIENT_ID!, client_secret: env.DISCORD_CLIENT_SECRET!, grant_type: 'authorization_code', code, redirect_uri: redirect })
      const access = str(t.access_token)
      if (!access) throw new Error('oauth_token_missing')
      const p = await getJson(urls.profile, `${str(t.token_type) ?? 'Bearer'} ${access}`)
      const id = str(p.id)
      if (!id || !/^\d{5,25}$/.test(id)) throw new Error('oauth_profile_invalid')
      const avatar = str(p.avatar)
      return {
        id,
        displayName: cleanName(str(p.global_name) ?? str(p.username), 'Игрок Discord'),
        avatarUrl: avatar && /^[a-f0-9_]{8,64}$/.test(avatar) ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128` : undefined,
        email: cleanEmail(p.email),
        emailVerified: p.verified === true && !!cleanEmail(p.email),
      }
    }
  }
}

/** Only same-site relative paths may be returned to after sign-in. */
export function safeNext(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && value.length < 300 ? value : '/account'
}
