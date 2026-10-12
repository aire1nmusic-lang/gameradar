import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AccountEntry } from './AccountEntry'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/controls'
import { authClient, authMessage, authReturnUrl } from '@/lib/supabaseAuth'
import type { useSupabaseAuth } from '@/hooks/useSupabaseAuth'

type Props = { external: ReturnType<typeof useSupabaseAuth>; refreshPrivate: () => Promise<void>; legacy: () => void; link: boolean }
export function SupabaseAccount({ external, refreshPrivate, legacy, link }: Props) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const attempted = useRef('')
  // OAuth/confirmation return: bridge once per identity, not after every token refresh or API error.
  useEffect(() => {
    if (!external.user || external.recovery || attempted.current === external.user.id || link) return
    attempted.current = external.user.id
    void external.bridge().then(ok => { if (ok) void refreshPrivate() })
  }, [external.user?.id, external.recovery, link])
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage(''); external.clearError()
    try { await action(); setPassword(''); await external.refresh() }
    catch (e) { setError(authMessage(e)) }
    finally { setBusy(false) }
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    await run(async () => {
      const client = await authClient()
      const result = mode === 'register'
        ? await client.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: authReturnUrl() } })
        : mode === 'reset' ? await client.auth.resetPasswordForEmail(email, { redirectTo: authReturnUrl(true) })
        : await client.auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      setMessage(mode === 'login' ? 'Вы вошли.' : 'Проверьте почту. Если действие доступно, придёт ссылка.')
    })
  }
  if (external.loading) return <main className="mx-auto max-w-xl p-6">Проверяем вход…</main>
  const recovery = external.recovery && external.user && <section className="space-y-3">
    <Field label="Новый пароль — от 12 символов"><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></Field>
    <Button disabled={busy || password.length < 12} full onClick={() => void run(async () => {
      const { error } = await (await authClient()).auth.updateUser({ password })
      if (error) throw error
      external.clearRecovery(); setMessage('Пароль сохранён.')
    })}>Сохранить пароль</Button>
  </section>
  if (external.user && !recovery) return <main className="mx-auto w-full max-w-xl space-y-5 px-4 py-8">
    <section className="gs-account-card space-y-4 rounded-[22px] border p-5 sm:p-7">
      <h1 className="text-2xl font-semibold">Вы вошли в GameScout</h1>
      <p className="break-words text-sm">{external.user.email}</p>
      <p className="text-sm leading-6">{link ? 'Свяжите этот вход со своим прежним аккаунтом, чтобы сохранить профиль и права.' : 'Подключаем ваш профиль. Если сервис аккаунтов временно недоступен, попробуйте позже. Данные прежних аккаунтов сохраняются.'}</p>
      {external.bridgeError && <p role="alert" className="break-words text-sm text-danger-300">{external.bridgeError}</p>}
      {error && <p role="alert" className="text-sm text-danger-300">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button size="lg" className="max-w-full whitespace-normal" disabled={busy} onClick={() => void run(async () => { if (await external.bridge(link)) await refreshPrivate() })}>{link ? 'Связать с прежним аккаунтом' : 'Открыть профиль'}</Button>
        <Button size="lg" variant="outline" onClick={legacy}>Прежний аккаунт</Button>
        <Button size="lg" variant="ghost" disabled={busy} onClick={() => void run(async () => { const { error } = await (await authClient()).auth.signOut({ scope: 'local' }); if (error) throw error; attempted.current = '' })}>Выйти</Button>
      </div>
    </section>
  </main>
  return <>
    <AccountEntry mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} name={name} setName={setName}
      busy={busy} error={error || external.error} apiError="" message={message} registrationOpen providers={['google', 'discord']} submit={e => void submit(e)} confirmation={recovery}
      alternateAction={<Button size="lg" full variant="outline" onClick={legacy}>Вход в прежний аккаунт</Button>}
      providerLogin={provider => void run(async () => {
        if (provider !== 'google' && provider !== 'discord') return
        const { error } = await (await authClient()).auth.signInWithOAuth({ provider, options: { redirectTo: authReturnUrl(), scopes: provider === 'discord' ? 'identify email' : undefined } })
        if (error) throw error
      })} />
  </>
}
