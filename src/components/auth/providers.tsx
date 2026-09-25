import type { LoginProvider } from '@/models'
import { cn } from '@/lib/utils'

export const PROVIDER_LABEL: Record<LoginProvider, string> = {
  google: 'Google',
  yandex: 'Яндекс',
  vk: 'VK ID',
  discord: 'Discord',
}

/** Small recognisable brand marks, drawn inline so no third-party asset is loaded. */
export function ProviderMark({ provider, size = 20, className }: { provider: LoginProvider; size?: number; className?: string }) {
  const box = cn('grid shrink-0 place-items-center overflow-hidden', className)
  if (provider === 'google') {
    return (
      <span className={cn(box, 'rounded-[5px] bg-white')} style={{ width: size, height: size }} aria-hidden>
        <svg viewBox="0 0 48 48" width={size * 0.72} height={size * 0.72}>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
      </span>
    )
  }
  if (provider === 'yandex') {
    return (
      <span
        className={cn(box, 'rounded-full font-sans font-bold text-white')}
        style={{ width: size, height: size, background: '#FC3F1D', fontSize: size * 0.62, lineHeight: 1 }}
        aria-hidden
      >
        Я
      </span>
    )
  }
  if (provider === 'vk') {
    return (
      <span
        className={cn(box, 'rounded-[6px] font-sans font-bold tracking-[-0.04em] text-white')}
        style={{ width: size, height: size, background: '#0077FF', fontSize: size * 0.42, lineHeight: 1 }}
        aria-hidden
      >
        VK
      </span>
    )
  }
  return (
    <span className={cn(box, 'rounded-[6px]')} style={{ width: size, height: size, background: '#5865F2' }} aria-hidden>
      <svg viewBox="0 0 127.14 96.36" width={size * 0.66} height={size * 0.66} fill="#fff">
        <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
      </svg>
    </span>
  )
}

/**
 * A full-page link that starts the provider flow. It is a plain anchor on
 * purpose: the Worker answers with a redirect to the provider.
 */
export function ProviderButton({ provider, href, wide }: { provider: LoginProvider; href: string; wide?: boolean }) {
  return (
    <a
      href={href}
      className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-white/[0.09] bg-white/[0.04] px-3 text-[14px] text-ink-50 transition-colors duration-200 select-none hover:border-white/20 hover:bg-white/[0.07]"
    >
      <ProviderMark provider={provider} />
      {wide ? `Войти через ${PROVIDER_LABEL[provider]}` : PROVIDER_LABEL[provider]}
    </a>
  )
}
