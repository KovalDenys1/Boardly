export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'theme'
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

const VALID_THEME_MODES: ThemeMode[] = ['light', 'dark', 'system']

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  if (value && (VALID_THEME_MODES as string[]).includes(value)) {
    return value as ThemeMode
  }
  return 'system'
}

export function getStoredThemeMode(storage?: Pick<Storage, 'getItem'>): ThemeMode {
  return normalizeThemeMode(storage?.getItem(THEME_STORAGE_KEY))
}

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  if (mode === 'system') return prefersDark ? 'dark' : 'light'
  return mode
}

export function applyThemeMode(
  mode: ThemeMode,
  options?: {
    documentElement?: HTMLElement
    matchMedia?: (query: string) => MediaQueryList
  }
) {
  const isServer = typeof window === 'undefined'
  if (isServer && (!options?.documentElement || !options?.matchMedia)) {
    return
  }

  const documentElement = options?.documentElement ?? document.documentElement
  const matchMedia = options?.matchMedia ?? window.matchMedia
  const resolved = resolveThemeMode(mode, matchMedia(DARK_MEDIA_QUERY).matches)

  documentElement.classList.toggle('dark', resolved === 'dark')
  documentElement.style.colorScheme = resolved
}

export function getThemeInitScript() {
  return `(() => {
  try {
    const stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    const prefersDark = window.matchMedia('${DARK_MEDIA_QUERY}').matches;
    const resolved = stored === 'dark' || (stored !== 'light' && prefersDark) ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
  } catch {}
})();`
}
