import { useState } from 'react'
import { Modal } from '@/components/ui/overlays'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'
import { useAuth } from '@/hooks/useAuth'

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth()
  const [name, setName] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Sign in with Discord returns to the page the player started from.
  const here = typeof window === 'undefined' ? '/dashboard' : window.location.pathname + window.location.search.replace(/[?&]auth_error=discord/, '')
  const discordHref = '/api/v1/auth/discord?next=' + encodeURIComponent(here || '/dashboard')
  const authError = typeof window !== 'undefined' && /[?&]auth_error=discord/.test(window.location.search)
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await auth.login(name, secret); setSecret(''); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось войти') }
    finally { setBusy(false) }
  }
  return <Modal open={open} onClose={onClose} title={auth.user ? 'Ваш аккаунт GameScout' : 'Вход в GameScout'} description="Кабинет владельца и подтверждение серверов">
    {auth.user ? <div className="space-y-4"><p>Вы вошли как {auth.user.displayName}</p><Button to="/dashboard" onClick={onClose}>Кабинет владельца</Button><Button onClick={async () => { await auth.logout(); onClose() }}>Выйти</Button></div> :
      auth.loading ? <p>Проверяем сессию…</p> :
      <div className="space-y-4">
      {authError && <Notice tone="danger">Не удалось войти через Discord. Попробуйте ещё раз.</Notice>}
      {auth.providers.includes('discord') && (
        <Button variant="primary" full onClick={() => window.location.assign(discordHref)}>Войти через Discord</Button>
      )}
      {auth.devAuthEnabled ? <form onSubmit={login} className="space-y-4">
        <Notice tone="info">Локальный вход для разработки. Используйте имя владельца и DEV_AUTH_SECRET из локального файла .dev.vars. Повторный вход с тем же именем открывает тот же аккаунт.</Notice>
        <Field label="Имя владельца" required><Input name="displayName" autoComplete="username" value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={60} /></Field>
        <Field label="Локальный ключ входа" required><Input name="secret" type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} required /></Field>
        {error && <p role="alert" className="text-danger-300">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy} full>{busy ? 'Входим…' : 'Войти'}</Button>
      </form> : !auth.providers.length && <Notice tone="info">{auth.error || 'Вход владельцев в этом окружении ещё не подключён.'}</Notice>}
      </div>}
  </Modal>
}
