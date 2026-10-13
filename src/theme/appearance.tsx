import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

/**
 * Site-wide look, chosen by the owner while comparing variants (/design).
 *
 * Every option is an attribute on <html> (data-surface, data-hero, data-motion,
 * data-icons, data-logo), so CSS does most of the work and the choice applies
 * before React renders. Stored per browser; the defaults are the look every
 * visitor gets until the owner picks new ones.
 */

export type Surface = 'night' | 'graphite' | 'dusk'
export type HeroSize = 'compact' | 'large' | 'cinematic'
export type Motion = 'calm' | 'lively'
export type IconStyle = 'monogram' | 'glyph' | 'crest'
export type LogoMode = 'live' | 'cyan' | 'neon'
export type ColorMode = 'dark' | 'light'

export type Appearance = {
  surface: Surface
  hero: HeroSize
  motion: Motion
  icons: IconStyle
  logo: LogoMode
}

export const APPEARANCE_DEFAULTS: Appearance = {
  surface: 'night',
  hero: 'compact',
  motion: 'calm',
  icons: 'glyph',
  logo: 'live',
}

export const APPEARANCE_OPTIONS = {
  surface: [
    { value: 'night', label: 'Ночь', hint: 'как сейчас: почти чёрный фон' },
    { value: 'graphite', label: 'Графит', hint: 'светлее, серо-синий фон и карточки' },
    { value: 'dusk', label: 'Сумерки', hint: 'глубокий сине-фиолетовый, под неоновый логотип' },
  ],
  hero: [
    { value: 'compact', label: 'Компактная', hint: '360 px: список серверов сразу под шапкой' },
    { value: 'large', label: 'Большая', hint: '520 px: картинка заметнее, список ниже' },
    { value: 'cinematic', label: 'Во весь экран', hint: 'до 720 px: картинка главная, список после прокрутки' },
  ],
  motion: [
    { value: 'calm', label: 'Спокойно', hint: 'без анимаций при прокрутке' },
    { value: 'lively', label: 'Живо', hint: 'блоки мягко появляются, шапка с параллаксом' },
  ],
  icons: [
    { value: 'monogram', label: 'Монограмма', hint: 'буквы названия на цветной плашке' },
    { value: 'glyph', label: 'Знак игры', hint: 'значок игры в её цветах' },
    { value: 'crest', label: 'Герб', hint: 'щит с буквами и значком игры' },
  ],
  logo: [
    { value: 'live', label: 'Переливается', hint: 'голубой ↔ розовый, 16 с' },
    { value: 'cyan', label: 'Голубой', hint: 'серебро и циан' },
    { value: 'neon', label: 'Неон', hint: 'фиолетовый и розовый' },
  ],
} as const satisfies Record<keyof Appearance, readonly { value: string; label: string; hint: string }[]>

const STORAGE_KEY = 'gs.appearance.v1'
const COLOR_MODE_KEY = 'gs.color-mode.v1'
const DESIGNER_KEY = 'gs.designer'

function sanitize(raw: unknown): Appearance {
  const out = { ...APPEARANCE_DEFAULTS }
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(APPEARANCE_DEFAULTS) as (keyof Appearance)[]) {
      const value = (raw as Record<string, unknown>)[key]
      if (APPEARANCE_OPTIONS[key].some((option) => option.value === value)) (out as Record<string, string>)[key] = value as string
    }
  }
  return out
}

export function readAppearance(): Appearance {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return { ...APPEARANCE_DEFAULTS }
  }
}

/** The light theme is switched off by the owner (13.10.2026): the site is always dark. The light styles stay in the code. */
export function readColorMode(): ColorMode {
  return 'dark'
}

export function applyColorMode(mode: ColorMode) {
  document.documentElement.dataset.colorMode = mode
}

/** Puts the choice on <html>; called before the first render and on every change. */
export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement
  root.dataset.surface = appearance.surface
  root.dataset.hero = appearance.hero
  root.dataset.motion = appearance.motion
  root.dataset.icons = appearance.icons
  if (appearance.logo === 'live') delete root.dataset.logo
  else root.dataset.logo = appearance.logo
}

export function isDesigner(): boolean {
  try {
    return localStorage.getItem(DESIGNER_KEY) === '1'
  } catch {
    return false
  }
}

export function setDesigner(on: boolean) {
  try {
    if (on) localStorage.setItem(DESIGNER_KEY, '1')
    else localStorage.removeItem(DESIGNER_KEY)
  } catch {
    // storage blocked: the panel simply stays on the /design page
  }
}

type AppearanceContextValue = {
  appearance: Appearance
  set: <K extends keyof Appearance>(key: K, value: Appearance[K]) => void
  reset: () => void
  designer: boolean
  setDesignerMode: (on: boolean) => void
  colorMode: ColorMode
  setColorMode: (mode: ColorMode) => void
  toggleColorMode: () => void
}

const AppearanceContext = createContext<AppearanceContextValue>({
  appearance: APPEARANCE_DEFAULTS,
  set: () => undefined,
  reset: () => undefined,
  designer: false,
  setDesignerMode: () => undefined,
  colorMode: 'dark',
  setColorMode: () => undefined,
  toggleColorMode: () => undefined,
})

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(readAppearance)
  const [designer, setDesignerState] = useState(isDesigner)
  const [colorMode, setColorModeState] = useState<ColorMode>(readColorMode)

  const commit = useCallback((next: Appearance) => {
    setAppearance(next)
    applyAppearance(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // storage blocked: the choice lasts for this page view
    }
  }, [])

  const setColorMode = useCallback((requested: ColorMode) => {
    const mode: ColorMode = requested === 'light' ? 'dark' : requested
    setColorModeState(mode)
    applyColorMode(mode)
    try {
      localStorage.setItem(COLOR_MODE_KEY, mode)
    } catch {
      // storage blocked: keep the preference for this page view
    }
  }, [])

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      set: (key, v) => commit({ ...appearance, [key]: v }),
      reset: () => commit({ ...APPEARANCE_DEFAULTS }),
      designer,
      setDesignerMode: (on) => {
        setDesigner(on)
        setDesignerState(on)
      },
      colorMode,
      setColorMode,
      toggleColorMode: () => setColorMode(colorMode === 'dark' ? 'light' : 'dark'),
    }),
    [appearance, colorMode, commit, designer, setColorMode],
  )

  return <AppearanceContext value={value}>{children}</AppearanceContext>
}

export function useAppearance() {
  return use(AppearanceContext)
}
