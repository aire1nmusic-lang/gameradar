import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { authClient, authMessage, consumeAuthCallback, supabaseAuthEnabled, verifiedAuthUser } from '@/lib/supabaseAuth'
import { apiSend, ApiRequestError } from '@/repositories/http/client'

/** Separate identity state: a Supabase user must never masquerade as a private account with roles. */
export function useSupabaseAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(supabaseAuthEnabled)
  const [error, setError] = useState('')
  const [callbackError, setCallbackError] = useState('')
  const [bridgeError, setBridgeError] = useState('')
  const [recovery, setRecovery] = useState(false)
  async function refresh() {
    try { setUser(await verifiedAuthUser()); setError(''); setRecovery(sessionStorage.getItem('gamescout-password-recovery') === '1') }
    catch (e) { setUser(null); setError(e instanceof Error ? e.message : authMessage(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (!supabaseAuthEnabled) return
    let alive = true, unsubscribe: (() => void) | undefined
    void (async () => {
      try {
        // A cancelled or expired callback must not disable a fresh sign-in attempt.
        let callbackError = ''
        try { await consumeAuthCallback() }
        catch (e) { callbackError = e instanceof Error ? e.message : authMessage(e) }
        const client = await authClient()
        if (!alive) return
        const subscription = client.auth.onAuthStateChange(() => { if (alive) setTimeout(() => void refresh(), 0) }).data.subscription
        unsubscribe = () => subscription.unsubscribe()
        await refresh()
        if (alive && callbackError) setCallbackError(callbackError)
      } catch (e) { if (alive) { setError(e instanceof Error ? e.message : authMessage(e)); setLoading(false) } }
    })()
    return () => { alive = false; unsubscribe?.() }
  }, [])
  async function bridge(link = false) {
    setBridgeError('')
    try {
      const { data, error } = await (await authClient()).auth.getSession()
      if (error || !data.session) throw new Error('Войдите в аккаунт.')
      // The receiving server verifies this token independently before issuing its HttpOnly session.
      await apiSend('/auth/supabase', { accessToken: data.session.access_token, link })
      return true
    } catch (e) {
      setBridgeError(e instanceof ApiRequestError && (e.status >= 500 || e.status === 0 || e.status === 404)
        ? 'Сервис профилей временно недоступен. Ваш вход сохранён; попробуйте позже.'
        : e instanceof Error ? e.message : 'Профиль временно недоступен.')
      return false
    }
  }
  return { enabled: supabaseAuthEnabled, user, loading, error: callbackError || error, bridgeError, recovery, refresh, bridge,
    clearError: () => { setCallbackError(''); setError('') },
    clearRecovery: () => { sessionStorage.removeItem('gamescout-password-recovery'); setRecovery(false) } }
}
