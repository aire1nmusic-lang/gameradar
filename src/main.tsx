import { StrictMode, useEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { waitForHomeVisuals } from '@/lib/bootVisuals'
import { BrowserRouter } from 'react-router-dom'
import { initializeRepositories } from '@/repositories'
import { AuthProvider } from '@/hooks/useAuth'
import { AppearanceProvider, applyAppearance, applyColorMode, readAppearance, readColorMode } from '@/theme/appearance'
import App from './App'
import './index.css'
import '@/theme/colorMode.css'
import '@/theme/readability.css'
import '@/theme/lobby.css'
import '@/theme/glass.css'
import '@/theme/worldFonts'

// Design preview branch: the lobby look is on for everything except the hall.
document.documentElement.dataset.design = 'lobby'
applyAppearance(readAppearance())
applyColorMode(readColorMode())

const rootElement = document.getElementById('root')!
const bootShell = rootElement.innerHTML

// Data mounts the app; actual responsive hall visuals control its first reveal.
function finishBoot() {
  const html = document.documentElement
  window.clearTimeout(Number(html.dataset.gsLoaderTimer || 0))
  delete html.dataset.gsLoaderTimer
  delete html.dataset.gsLoaderShownAt
  html.classList.remove('gs-loader-visible', 'gs-loader-leaving', 'gs-boot-pending')
  rootElement.removeAttribute('aria-busy')
  document.querySelector('.gs-loader')?.remove()
}

function Bootstrap() {
  const [ready, setReady] = useState(false)
  const [bootComplete, setBootComplete] = useState(false)
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

  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    waitForHomeVisuals(rootElement, controller.signal).then(() => {
      if (!controller.signal.aborted) setBootComplete(true)
    }).catch(() => {
      if (controller.signal.aborted) return
      document.documentElement.classList.add('gs-loader-visible')
      setError('visuals')
    })
    return () => controller.abort()
  }, [ready])

  // Reveal the whole first screen, not an empty hall with just its text.
  useLayoutEffect(() => {
    if (bootComplete) finishBoot()
  }, [bootComplete])

  useEffect(() => {
    if (!bootComplete) return
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
  }, [bootComplete])

  const errorDisplay = error ? createPortal(
    <div className="gs-error" role="alert">
      <div>Не удалось загрузить сайт. Проверьте соединение.</div>
      <button type="button" onClick={() => {
        if (ready) window.location.reload()
        else setAttempt(value => value + 1)
      }}>Повторить</button>
    </div>,
    document.body,
  ) : null

  if (!ready) {
    return <><div dangerouslySetInnerHTML={{ __html: bootShell }} />{errorDisplay}</>
  }

  return (
    <>
    {errorDisplay}
    <BrowserRouter>
      <AuthProvider>
        <AppearanceProvider>
          <App />
        </AppearanceProvider>
      </AuthProvider>
    </BrowserRouter>
    </>
  )
}

createRoot(rootElement).render(<StrictMode><Bootstrap /></StrictMode>)