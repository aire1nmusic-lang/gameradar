/** Verify with the configured Auth server, never trust browser metadata or decoded JWTs. */
export function supabaseAuthConfiguration(url, key) {
  if (!url && !key) return null
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url ?? '')
    || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '')) throw new Error('supabase_auth_config_invalid')
  return { url, key, provider: `supabase:${new URL(url).hostname.split('.')[0]}` }
}

export async function verifiedSupabaseUser(config, accessToken, request = fetch) {
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8192)
    throw new Error('supabase_token_invalid')
  const response = await request(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.key, Authorization: `Bearer ${accessToken}` },
    redirect: 'error', signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(response.status >= 500 ? 'supabase_unavailable' : 'supabase_token_invalid')
  const user = await response.json()
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(user?.id ?? '')
    || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at))
    || typeof user.email !== 'string' || user.email.length > 254
    || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new Error('supabase_email_unverified')
  return {
    subject: user.id, email: user.email.trim().toLowerCase(),
    // A nickname is presentation only. No metadata becomes a permission or an account ID.
    displayName: String(user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? 'Игрок')
      .replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Игрок',
    method: ['google', 'discord'].includes(user.app_metadata?.provider) ? user.app_metadata.provider : 'email',
  }
}
