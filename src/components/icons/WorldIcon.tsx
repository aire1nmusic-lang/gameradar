import type { ReactNode, SVGProps } from 'react'
import { cn } from '@/lib/utils'

export type WorldIconName =
  | 'home' | 'servers' | 'favorite' | 'profile' | 'search'
  | 'sun' | 'moon' | 'catalog' | 'support' | 'opening' | 'online'
  | 'filter' | 'list' | 'grid' | 'owner' | 'admin' | 'users'
  | 'claim' | 'vote' | 'payment' | 'coins' | 'chevronRight'
  | 'chronicles' | 'ballot'
  | 'logout' | 'shield' | 'copy' | 'plus' | 'close'

type Props = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: WorldIconName
  size?: number
  strokeWidth?: number
}

/**
 * GameScout world UI icon set.
 * L2 is the first complete skin: sharp heraldic geometry, restrained curves,
 * currentColor only, so the same SVG stays crisp on mobile/desktop and in both themes.
 *
 * Future worlds can plug in a second path registry without changing page markup.
 */
export function WorldIcon({ name, size = 20, strokeWidth = 1.8, className, ...props }: Props) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('gs-world-icon shrink-0', className)}
      aria-hidden
      focusable="false"
      {...props}
    >
      <g {...common}>{PATHS[name]}</g>
    </svg>
  )
}

const PATHS: Record<WorldIconName, ReactNode> = {
  home: <>
    <path d="M3.5 10.6 12 3.8l8.5 6.8v9.1a.9.9 0 0 1-.9.9H4.4a.9.9 0 0 1-.9-.9z"/>
    <path d="M8.4 20.6v-6.8h7.2v6.8"/>
    <path d="m7.1 8.8 4.9-3.9 4.9 3.9"/>
  </>,
  servers: <>
    <rect x="4" y="4" width="16" height="5" rx="1.4"/>
    <rect x="4" y="10.5" width="16" height="5" rx="1.4"/>
    <rect x="4" y="17" width="16" height="3" rx="1.2"/>
    <path d="M7 6.5h.01M7 13h.01M7 18.5h.01M10 6.5h6M10 13h6"/>
  </>,
  favorite: <>
    <path d="M12 20.3 4.6 13c-2.2-2.2-2.2-5.6 0-7.5 1.9-1.7 4.8-1.5 6.5.4l.9 1 .9-1c1.7-1.9 4.6-2.1 6.5-.4 2.2 1.9 2.2 5.3 0 7.5z"/>
    <path d="M12 8.3 9.7 6"/>
  </>,
  profile: <>
    <circle cx="12" cy="8.1" r="3.3"/>
    <path d="M5.1 20.2c.6-4 3.2-6.1 6.9-6.1s6.3 2.1 6.9 6.1"/>
    <path d="M8.1 4.7 12 2.8l3.9 1.9"/>
  </>,
  search: <>
    <circle cx="10.7" cy="10.7" r="6.1"/>
    <path d="m15.3 15.3 5.1 5.1"/>
    <path d="M8.5 7.3 10.7 5l2.2 2.3"/>
  </>,
  sun: <>
    <circle cx="12" cy="12" r="4.1"/>
    <path d="M12 2.3v2M12 19.7v2M2.3 12h2M19.7 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4"/>
  </>,
  moon: <>
    <path d="M19.8 15.1A8 8 0 0 1 8.9 4.2 8.4 8.4 0 1 0 19.8 15.1Z"/>
    <path d="M15.8 4.8 17 3.6l1.2 1.2L17 6z"/>
  </>,
  catalog: <>
    <path d="M4 5.2h16M4 12h16M4 18.8h16"/>
    <path d="M6.5 3.8v2.8M9 10.6v2.8M15 17.4v2.8"/>
  </>,
  support: <>
    <path d="M12 3.2 19 7v6.4c0 4.1-3.1 6.6-7 7.4-3.9-.8-7-3.3-7-7.4V7z"/>
    <path d="m8.2 12.3 2.4 2.4 5.2-5.2"/>
  </>,
  opening: <>
    <rect x="4" y="5" width="16" height="16" rx="3" fill="currentColor" fillOpacity=".12"/>
    <path d="M8 3v4M16 3v4M4 10h16"/>
    <path d="m10 13 5 3-5 3z" fill="currentColor" strokeWidth="1"/>
  </>,
  chronicles: <>
    <path d="M12 6C8 3.5 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-5-1.5-9 1Z" fill="currentColor" fillOpacity=".12"/>
    <path d="M12 6v14M6 8l3 1M6 12l3 1M15 9l3-1M15 13l3-1"/>
  </>,
  ballot: <>
    <path d="m6 11-3 4v6h18v-6l-3-4M3 15h18M9 18h6"/>
    <path d="m7 6 7-4 4 7-7 4Z" fill="currentColor" fillOpacity=".18"/>
    <path d="m10 7 2 1 2-3"/>
  </>,
  online: <>
    <path d="M4.5 17.8c2.2-3.8 4.8-5.7 7.5-5.7s5.3 1.9 7.5 5.7"/>
    <path d="M7.3 14.2A6.6 6.6 0 0 1 12 12a6.6 6.6 0 0 1 4.7 2.2"/>
    <circle cx="12" cy="18.2" r="1.2"/>
    <path d="M4.7 8.4 7 6.1M19.3 8.4 17 6.1"/>
  </>,
  filter: <>
    <path d="M4 5h16l-6.1 7v5.4l-3.8 2V12z"/>
    <path d="M8 8h8"/>
  </>,
  list: <>
    <path d="M9 6h11M9 12h11M9 18h11"/>
    <path d="M4 6h.01M4 12h.01M4 18h.01"/>
  </>,
  grid: <>
    <rect x="4" y="4" width="6" height="6" rx="1"/>
    <rect x="14" y="4" width="6" height="6" rx="1"/>
    <rect x="4" y="14" width="6" height="6" rx="1"/>
    <rect x="14" y="14" width="6" height="6" rx="1"/>
  </>,
  owner: <>
    <path d="M12 3.2 18.2 6v5.7c0 3.6-2.7 6.1-6.2 7.1-3.5-1-6.2-3.5-6.2-7.1V6z"/>
    <path d="M8.8 12.1 11 14.3l4.4-4.4"/>
  </>,
  admin: <>
    <path d="M12 3.2 14 5l2.7-.2.8 2.6 2.2 1.5-1.1 2.5 1.1 2.5-2.2 1.5-.8 2.6-2.7-.2-2 1.8-2-1.8-2.7.2-.8-2.6-2.2-1.5 1.1-2.5-1.1-2.5 2.2-1.5.8-2.6L10 5z"/>
    <circle cx="12" cy="11.4" r="2.7"/>
  </>,
  users: <>
    <circle cx="9" cy="8" r="2.7"/>
    <path d="M3.8 18c.5-3.2 2.4-4.8 5.2-4.8s4.7 1.6 5.2 4.8"/>
    <circle cx="16.8" cy="9" r="2.1"/>
    <path d="M15.2 13.5c2.8.2 4.5 1.7 5 4.5"/>
  </>,
  claim: <>
    <path d="M6 3.8h9l3 3v13.4H6z"/>
    <path d="M15 3.8v3h3M9 11.2h6M9 15h4"/>
    <path d="m8.3 7.9 1.1 1.1 2-2"/>
  </>,
  vote: <>
    <path d="M12 3.2 14 8l5.1.4-3.9 3.3 1.2 5-4.4-2.7-4.4 2.7 1.2-5-3.9-3.3L10 8z"/>
  </>,
  payment: <>
    <rect x="3.5" y="5" width="17" height="14" rx="2"/>
    <path d="M3.5 9h17M7 15h3.5"/>
  </>,
  coins: <>
    <ellipse cx="12" cy="7" rx="6.5" ry="3"/>
    <path d="M5.5 7v4c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3V7M5.5 11v4c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3v-4"/>
  </>,
  chevronRight: <path d="m9 5 7 7-7 7"/>,
  logout: <>
    <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10"/>
    <path d="M13 8l4 4-4 4M17 12H9"/>
  </>,
  shield: <>
    <path d="M12 3.1 18.5 6v5.9c0 3.8-2.9 6.4-6.5 7.4-3.6-1-6.5-3.6-6.5-7.4V6z"/>
    <path d="m8.9 11.8 2.1 2.1 4.2-4.2"/>
  </>,
  copy: <>
    <rect x="8" y="8" width="11" height="11" rx="2"/>
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
  </>,
  plus: <>
    <path d="M12 5v14M5 12h14"/>
  </>,
  close: <>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>
  </>,
}
