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

applyAppearance(readAppearance())
applyColorMode(readColorMode())

const rootElement = document.getElementById('root')!
const bootShell = rootElement.innerHTML

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

async function waitForCriticalHomeVisual() {
  if (window.location.pathname !== '/') return
  const src = window.matchMedia('(max-width: 1023px)').matches
    ? '/media/hub/nave-m-720.webp'
    : '/media/hub/nave-1920.webp'

  await new Promise<void>(resolve => {
    const image = new Image()
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    image.onload = finish
    image.onerror = finish
    image.src = src
    if (image.complete) finish()
    window.setTimeout(finish, 8000)
  })
}

async function finishBoot(active: () => boolean) {
  const html = document.documentElement
  const shownAt = Number(html.dataset.gsLoaderShownAt || 0)
  const timerId = Number(html.dataset.gsLoaderTimer || 0)

  if (!shownAt) {
    if (timerId) window.clearTimeout(timerId)
    if (active()) html.classList.remove('gs-loader-visible', 'gs-loader-leaving')
    return
  }

  const minimumVisibleMs = 700
  const remaining = Math.max(0, minimumVisibleMs - (performance.now() - shownAt))
  if (remaining) await sleep(remaining)
  if (!active()) return

  html.classList.add('gs-loader-leaving')
  await sleep(220)
  if (active()) html.classList.remove('gs-loader-visible', 'gs-loader-leaving')
}

function Bootstrap() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const isActive = () => active

    setError('')

    Promise.all([
      initializeRepositories(),
      document.fonts?.ready,
      waitForCriticalHomeVisual(),
    ]).then(async () => {
      if (!active) return
      await finishBoot(isActive)
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