import { availableLocales, defaultLocale } from '@/i18n'
import {
  getStoredThemeMode,
  normalizeThemeMode,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from './theme'

const LANGUAGE_STORAGE_KEYS = ['i18nextLng', 'language'] as const

export type AppearancePreferenceSnapshot = {
  language: string
  theme: ThemeMode
}

export function normalizeAppearanceLocale(value: string | null | undefined): string {
  const normalized = value?.toLowerCase().split('-')[0] || defaultLocale
  return (availableLocales as readonly string[]).includes(normalized) ? normalized : defaultLocale
}

export function getStoredAppearanceLocale(storage?: Pick<Storage, 'getItem'>): string {
  if (!storage) {
    return defaultLocale
  }

  for (const key of LANGUAGE_STORAGE_KEYS) {
    const storedValue = storage.getItem(key)
    if (storedValue) {
      return normalizeAppearanceLocale(storedValue)
    }
  }

  return defaultLocale
}

export function setStoredAppearanceLocale(
  storage: Pick<Storage, 'setItem'>,
  language: string
): string {
  const normalizedLanguage = normalizeAppearanceLocale(language)

  for (const key of LANGUAGE_STORAGE_KEYS) {
    storage.setItem(key, normalizedLanguage)
  }

  return normalizedLanguage
}

export function setStoredThemePreference(
  storage: Pick<Storage, 'setItem'>,
  theme: string
): ThemeMode {
  const normalizedTheme = normalizeThemeMode(theme)
  storage.setItem(THEME_STORAGE_KEY, normalizedTheme)
  return normalizedTheme
}

export function getStoredAppearancePreferences(
  storage?: Pick<Storage, 'getItem'>
): AppearancePreferenceSnapshot {
  return {
    language: getStoredAppearanceLocale(storage),
    theme: getStoredThemeMode(storage),
  }
}
