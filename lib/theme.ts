export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'theme'
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value
  }

  return 'system'
}

export function getStoredThemeMode(storage?: Pick<Storage, 'getItem'>): ThemeMode {
  if (!storage) {
    return 'system'
  }

  return normalizeThemeMode(storage.getItem(THEME_STORAGE_KEY))
}

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  if (mode === 'system') {
    return prefersDark ? 'dark' : 'light'
  }

  return mode
}

export function applyThemeMode(
  mode: ThemeMode,
  options?: {
    documentElement?: HTMLElement
    matchMedia?: (query: string) => MediaQueryList
  }
) {
  if (typeof window === 'undefined' && !options?.documentElement) {
    return
  }

  const documentElement = options?.documentElement ?? document.documentElement
  const matchMedia =
    options?.matchMedia ?? ((query: string) => window.matchMedia(query))
  const resolvedTheme = resolveThemeMode(mode, matchMedia(DARK_MEDIA_QUERY).matches)
  const isDark = resolvedTheme === 'dark'

  documentElement.classList.toggle('dark', isDark)
  documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

export function getThemeInitScript() {
  return `(() => {
  try {
    const theme = ${JSON.stringify(THEME_STORAGE_KEY)};
    const stored = window.localStorage.getItem(theme);
    const mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    const prefersDark = window.matchMedia(${JSON.stringify(DARK_MEDIA_QUERY)}).matches;
    const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  } catch {}
})();`
}
