import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { initializeRepositories } from '@/repositories'
import { AuthProvider } from '@/hooks/useAuth'
import { AppearanceProvider, applyAppearance, applyColorMode, readAppearance, readColorMode } from '@/theme/appearance'
import App from './App'
import './index.css'
import '@/theme/colorMode.css'
import '@/theme/worldFonts'

// The owner's look choices land on <html> before anything renders: no flash of the default.
applyAppearance(readAppearance())
applyColorMode(readColorMode())

const rootElement = document.getElementById('root')!
/** The skeleton index.html paints before any script runs; kept on screen until the catalogue is ready. */
const bootShell = rootElement.innerHTML

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
  if (!ready) {
    return (
      <>
        <div dangerouslySetInnerHTML={{ __html: bootShell }} />
        {error && (
          <div className="bs-msg" role="alert" style={{ position: 'fixed', left: 0, right: 0, top: '42vh' }}>
            <div>Не удалось загрузить каталог. Проверьте соединение.</div>
            <button type="button" onClick={() => setAttempt(n => n + 1)}>Повторить</button>
          </div>
        )}
      </>
    )
  }
  return <BrowserRouter><AuthProvider><AppearanceProvider><App /></AppearanceProvider></AuthProvider></BrowserRouter>
}
createRoot(rootElement).render(<StrictMode><Bootstrap /></StrictMode>)
