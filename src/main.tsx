import { StrictMode, useEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { initializeRepositories } from '@/repositories'
import { AuthProvider } from '@/hooks/useAuth'
import { AppearanceProvider, applyAppearance, applyColorMode, readAppearance, readColorMode } from '@/theme/appearance'
import App from './App'
import './index.css'
import '@/theme/colorMode.css'
import '@/theme/worldFonts'

applyAppearance(readAppearance())
applyColorMode(readColorMode())

const rootElement = document.getElementById('root')!
const bootShell = rootElement.innerHTML

// Boot only waits for the catalog structure. Fonts and scenery load independently.
function finishBoot() {
  const html = document.documentElement
  window.clearTimeout(Number(html.dataset.gsLoaderTimer || 0))
  delete html.dataset.gsLoaderTimer
  delete html.dataset.gsLoaderShownAt
  html.classList.remove('gs-loader-visible', 'gs-loader-leaving')
  document.querySelector('.gs-loader')?.remove()
}

function Bootstrap() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    setError('')

    initializeRepositories().then(() => {
      if (active) setReady(true)
    }).catch(errorValue => {
      if (!active) return
      document.documentElement.classList.add('gs-loader-visible')
      if (!document.documentElement.dataset.gsLoaderShownAt) {
        document.documentElement.dataset.gsLoaderShownAt = String(performance.now())
      }
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    })

    return () => {
      active = false
    }
  }, [attempt])

  // Remove the sibling overlay in the same commit that mounts the actual app.
  useLayoutEffect(() => {
    if (ready) finishBoot()
  }, [ready])

  useEffect(() => {
    if (!ready) return
    const currentBuild = document.querySelector<HTMLMetaElement>('meta[name="gs-build"]')?.content
    if (!currentBuild || currentBuild.startsWith('__')) return

    let checking = false
    const checkForUpdate = async () => {
      if (checking) return
      checking = true
      try {
        const response = await fetch(`/?_gs_v=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) return
        const source = await response.text()
        const latestBuild = source.match(/<meta name="gs-build" content="([^"]+)"/)?.[1]
        if (latestBuild && latestBuild !== currentBuild) window.location.reload()
      } catch {
        // A version check must never disturb the user.
      } finally {
        checking = false
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }

    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', checkForUpdate)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ready])

  if (!ready) {
    return (
      <>
        <div dangerouslySetInnerHTML={{ __html: bootShell }} />
        {error && (
          <div className="gs-error" role="alert">
            <div>Не удалось загрузить каталог. Проверьте соединение.</div>
            <button type="button" onClick={() => setAttempt(value => value + 1)}>Повторить</button>
          </div>
        )}
      </>
    )
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppearanceProvider>
          <App />
        </AppearanceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

createRoot(rootElement).render(<StrictMode><Bootstrap /></StrictMode>)