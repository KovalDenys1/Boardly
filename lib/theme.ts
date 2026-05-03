export type ThemeMode = 'light'

export const THEME_STORAGE_KEY = 'theme'
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  void value
  return 'light'
}

export function getStoredThemeMode(storage?: Pick<Storage, 'getItem'>): ThemeMode {
  void storage
  return 'light'
}

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  void mode
  void prefersDark
  return 'light'
}

export function applyThemeMode(
  mode: ThemeMode,
  options?: {
    documentElement?: HTMLElement
    matchMedia?: (query: string) => MediaQueryList
  }
) {
  void mode
  if (typeof window === 'undefined' && !options?.documentElement) {
    return
  }

  const documentElement = options?.documentElement ?? document.documentElement
  documentElement.classList.remove('dark')
  documentElement.style.colorScheme = 'light'
}

export function getThemeInitScript() {
  return `(() => {
  try {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
  } catch {}
})();`
}
