import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@/models'
import { repo } from '@/repositories'

interface AuthState {
  user: User | null
  loading: boolean
  devAuthEnabled: boolean
  /** production sign-in methods, e.g. ['discord'] */
  providers: string[]
  privateCore: boolean
  emailLogin: boolean
  registrationOpen: boolean
  error: string
  refresh: () => Promise<void>
  login: (displayName: string, secret: string) => Promise<void>
  logout: () => Promise<void>
}
const Context = createContext<AuthState | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [devAuthEnabled, setEnabled] = useState(false)
  const [providers, setProviders] = useState<string[]>([])
  // Until the session endpoint answers, keep legacy write flows closed.
  // A private API outage must not silently send users back to D1 ownership/payment paths.
  const [privateCore, setPrivateCore] = useState(true)
  const [emailLogin, setEmailLogin] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => {
    try { const session = await repo.users.session(); setUser(session.user); setEnabled(session.devAuthEnabled); setProviders(session.providers ?? []); setPrivateCore(session.privateCore ?? false); setEmailLogin(session.emailLogin === true); setRegistrationOpen(session.privateCore === true && session.registrationOpen === true); setError('') }
    catch (e) {
      setUser(null);setEmailLogin(false);setRegistrationOpen(false);setProviders([]);setEnabled(false)
      setError(e instanceof Error && 'code' in e && e.code === 'private_api_required'
        ? 'Вход временно недоступен. Попробуйте позже.'
        : e instanceof Error ? e.message : 'Ошибка авторизации')
    }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  const login = async (displayName: string, secret: string) => { await repo.users.login({ displayName, secret }); await refresh() }
  const logout = async () => { await repo.users.logout(); await refresh() }
  return <Context.Provider value={{ user, loading, devAuthEnabled, providers, privateCore, emailLogin, registrationOpen, error, refresh, login, logout }}>{children}</Context.Provider>
}
export function useAuth() { const context = useContext(Context); if (!context) throw new Error('AuthProvider is missing'); return context }
