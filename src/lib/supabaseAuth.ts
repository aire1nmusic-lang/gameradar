import type { SupabaseClient, User } from '@supabase/supabase-js'

export const supabaseAuthEnabled = import.meta.env.VITE_AUTH_BACKEND === 'supabase'
let clientPromise: Promise<SupabaseClient> | undefined
let callbackPromise: Promise<void> | undefined
export async function authClient() {
  return clientPromise ??= (async () => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseAuthEnabled || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url ?? '')
      || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '')) throw new Error('Вход временно не настроен.')
    const { createClient } = await import('@supabase/supabase-js')
    return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init,
      signal: AbortSignal.any([AbortSignal.timeout(12000), ...(init?.signal ? [init.signal] : [])]) }) }, auth: { flowType: 'pkce', detectSessionInUrl: false,
      storageKey: 'gamescout-supabase-auth', persistSession: true, autoRefreshToken: true } })
  })()
}

export const authReturnUrl = (recovery = false) => `${location.origin}/account${recovery ? '?flow=recovery' : ''}`
/** Strip credentials before awaiting network calls; never forward them to the private API in a URL. */
export function consumeAuthCallback() {
  return callbackPromise ??= (async () => {
    const url = new URL(location.href), hash = new URLSearchParams(url.hash.slice(1))
    const code = url.searchParams.get('code')
    const accessToken = hash.get('access_token'), refreshToken = hash.get('refresh_token')
    const recovery = url.searchParams.get('flow') === 'recovery' || ['recovery', 'invite'].includes(hash.get('type') ?? '')
    const hasError = url.searchParams.has('error') || hash.has('error')
    if (!code && !accessToken && !hasError) return
    for (const key of ['code', 'error', 'error_code', 'error_description', 'flow']) url.searchParams.delete(key)
    url.hash = ''
    history.replaceState(null, '', url.pathname + url.search)
    if (hasError) throw new Error('Вход отменён или ссылка устарела. Попробуйте ещё раз.')
    const client = await authClient()
    const { error } = code ? await client.auth.exchangeCodeForSession(code)
      : await client.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken ?? '' })
    if (error) {
      const known = ['pkce_code_verifier_not_found', 'flow_state_not_found', 'flow_state_expired', 'bad_code_verifier', 'invalid_grant']
      // Diagnostic enums only: never log the URL, code, token, user or raw response.
      console.warn('GameScout Auth callback', { reason: known.includes(error.code ?? '') ? error.code : 'other', status: error.status ?? 0 })
      throw new Error(error.code === 'pkce_code_verifier_not_found'
        ? 'Браузер не сохранил подтверждение входа. Начните вход ещё раз в этой вкладке.'
        : 'Не удалось завершить вход. Попробуйте ещё раз; если ошибка повторится, запросите новую ссылку.')
    }
    if (recovery) sessionStorage.setItem('gamescout-password-recovery', '1')
  })()
}

export function authMessage(error: unknown) {
  const code = (error as { code?: string })?.code
  return ({ invalid_credentials: 'Неверная почта или пароль.', email_not_confirmed: 'Подтвердите почту по ссылке из письма.',
    over_email_send_rate_limit: 'Слишком много писем. Попробуйте позже.', over_request_rate_limit: 'Слишком много попыток. Попробуйте позже.',
    weak_password: 'Используйте более сложный пароль от 12 символов.' } as Record<string, string>)[code ?? '']
    ?? 'Не удалось выполнить действие. Проверьте подключение и попробуйте ещё раз.'
}
export async function verifiedAuthUser(): Promise<User | null> {
  const client = await authClient()
  const { data: session } = await client.auth.getSession()
  if (!session.session) return null
  const { data, error } = await client.auth.getUser()
  if (error) throw new Error(authMessage(error))
  return data.user
}
