import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { LoginProvider, User } from '@/models'
import { repo } from '@/repositories'

interface AuthState {
  user: User | null
  loading: boolean
  /** roles include ADMIN */
  isAdmin: boolean
  /** local development sign-in (DEV_AUTH_SECRET) */
  devAuthEnabled: boolean
  /** configured external providers, in display order of the API */
  providers: LoginProvider[]
  /** sign-in and registration by email; false until mail is configured */
  emailLogin: boolean
  /** why the session could not be read (API unreachable, …) */
  error: string
  refresh: () => Promise<void>
  /** stores the user an auth or account call returned, without another round trip */
  applyUser: (user: User) => void
  /** URL that starts sign-in with a provider (or links it, with `link`) and returns to `next` */
  providerHref: (provider: LoginProvider, next: string, link?: boolean) => string
  devLogin: (displayName: string, secret: string) => Promise<void>
  logout: () => Promise<void>
}

const Context = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [devAuthEnabled, setDevAuthEnabled] = useState(false)
  const [providers, setProviders] = useState<LoginProvider[]>([])
  const [emailLogin, setEmailLogin] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const session = await repo.users.session()
      setUser(session.user)
      setDevAuthEnabled(session.devAuthEnabled)
      setProviders(session.providers)
      setEmailLogin(session.emailLogin)
      setError('')
    } catch (e) {
      setUser(null)
      setError(e instanceof Error ? e.message : 'Ошибка авторизации')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const applyUser = useCallback((next: User) => setUser(next), [])
  const providerHref = useCallback(
    (provider: LoginProvider, next: string, link?: boolean) => repo.auth.providerUrl(provider, { next, link }),
    [],
  )
  const devLogin = async (displayName: string, secret: string) => {
    await repo.users.login({ displayName, secret })
    await refresh()
  }
  const logout = async () => {
    try {
      await repo.auth.logout()
    } finally {
      await refresh()
    }
  }
  const isAdmin = !!user?.roles.includes('ADMIN')

  return (
    <Context.Provider
      value={{ user, loading, isAdmin, devAuthEnabled, providers, emailLogin, error, refresh, applyUser, providerHref, devLogin, logout }}
    >
      {children}
    </Context.Provider>
  )
}

export function useAuth() {
  const context = useContext(Context)
  if (!context) throw new Error('AuthProvider is missing')
  return context
}

/** Current path and query without `auth_error`, for the provider round trip. */
export function returnPath(pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  params.delete('auth_error')
  const query = params.toString()
  return pathname + (query ? '?' + query : '')
}

/** The provider named by `?auth_error=<provider>` after a failed round trip. */
export function authErrorOf(search: string): LoginProvider | undefined {
  const value = new URLSearchParams(search).get('auth_error')
  return value === 'google' || value === 'yandex' || value === 'vk' || value === 'discord' ? value : undefined
}
