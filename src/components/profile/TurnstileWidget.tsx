import { useEffect, useRef, useState } from 'react'

type WidgetApi = {
  render: (target: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}

/** Render only when the private vote API requests extra scrutiny. */
export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const api = () => (window as Window & { turnstile?: WidgetApi }).turnstile
    let widgetId: string | undefined
    let live = true
    const render = () => {
      if (!live || !host.current || !api() || widgetId) return
      widgetId = api()!.render(host.current, {
        sitekey: siteKey,
        action: 'vote',
        theme: 'dark',
        callback: (token: string) => { if (live) { setError(''); onToken(token) } },
        'expired-callback': () => { if (live) onToken('') },
        'error-callback': () => { if (live) { onToken(''); setError('Проверка недоступна. Попробуйте позже.') } },
      })
    }
    let script = document.querySelector<HTMLScriptElement>('script[data-gs-turnstile]')
    if (!script) {
      script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.dataset.gsTurnstile = '1'
      document.head.append(script)
    }
    script.addEventListener('load', render)
    render()
    return () => {
      live = false
      script?.removeEventListener('load', render)
      if (widgetId) api()?.remove(widgetId)
    }
  }, [siteKey, onToken])
  return <div className="space-y-2">
    <div ref={host} aria-label="Дополнительная проверка голоса" />
    {error && <p role="alert" className="text-[13px] text-danger-300">{error}</p>}
  </div>
}
