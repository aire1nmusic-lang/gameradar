import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { initializeRepositories } from '@/repositories'
import { AuthProvider } from '@/hooks/useAuth'
import App from './App'
import './index.css'

function Bootstrap() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    initializeRepositories().then(() => { if (active) setReady(true) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [attempt])
  if (!ready) return <main className="mx-auto max-w-xl p-12"><h1 className="text-3xl">GameScout</h1><p role={error ? 'alert' : 'status'} className="mt-5">{error || 'Загружаем каталог…'}</p>{error && <button className="mt-5 rounded bg-white px-4 py-2 text-black" onClick={() => setAttempt(n => n + 1)}>Повторить</button>}</main>
  return <BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Bootstrap /></StrictMode>)
