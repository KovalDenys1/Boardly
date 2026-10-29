import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Only 'en' loads eagerly: an unprefixed page is served as <html lang="en"> and
// htmlTag detection keeps the first client render aligned with that SSR output,
// so 'en' resources are the only ones ever needed before hydration. The other
// locales (~300-450KB of source each) are fetched on demand by changeLanguageLazy,
// below, the moment a user's stored preference actually needs them. A /ru or /uk
// page brings its own (lib/page-locale.tsx).
import en from './locales/en'
import { defaultLocale, availableLocales } from './locales/meta'
import type { Locale } from './locales/meta'

type TranslationRecord = Record<string, unknown>

function deepMergeWithFallback(
  fallback: TranslationRecord,
  locale: TranslationRecord
): TranslationRecord {
  const merged: TranslationRecord = { ...fallback }

  for (const [key, value] of Object.entries(locale)) {
    const fallbackValue = fallback[key]

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      fallbackValue &&
      typeof fallbackValue === 'object' &&
      !Array.isArray(fallbackValue)
    ) {
      merged[key] = deepMergeWithFallback(
        fallbackValue as TranslationRecord,
        value as TranslationRecord
      )
      continue
    }

    merged[key] = value
  }

  return merged
}

const fallbackLocale = en as unknown as TranslationRecord
const resources = {
  en: { translation: fallbackLocale },
}

// Initialize i18next
i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    resources,
    fallbackLng: defaultLocale,
    supportedLngs: availableLocales,
    interpolation: {
      escapeValue: false, // React already does escaping
    },
    detection: {
      // Order of detection methods
      // Keep first client render aligned with SSR output (htmlTag from server),
      // then switch to persisted language after hydration in Providers.
      //
      // caches is deliberately empty: with caches: ['localStorage'], this
      // detector writes its htmlTag-detected value ('en', the SSR default)
      // back into the 'i18nextLng' key on every fresh page load, clobbering
      // whatever locale the user had actually picked before Providers' effect
      // gets a chance to read it back out — silently reverting the language on
      // every hard navigation/reload. Persistence is handled explicitly by
      // lib/appearance-preferences.ts (setStoredAppearanceLocale /
      // getStoredAppearanceLocale) instead, so the detector shouldn't also be
      // writing to storage.
      order: ['htmlTag'],
      caches: [],
    },
    react: {
      useSuspense: false, // Disable suspense to avoid hydration issues
    },
  })

const loadedLocales = new Set<Locale>(['en'])

async function loadLocaleResource(locale: Locale): Promise<void> {
  if (loadedLocales.has(locale)) return

  let mod: { default: TranslationRecord }
  switch (locale) {
    case 'uk':
      mod = await import('./locales/uk')
      break
    case 'no':
      mod = await import('./locales/no')
      break
    case 'ru':
      mod = await import('./locales/ru')
      break
    case 'de':
      mod = await import('./locales/de')
      break
    case 'es':
      mod = await import('./locales/es')
      break
    default: {
      // 'en' is bundled eagerly; a new locale without a case above fails tsc here.
      const preloaded: 'en' = locale
      void preloaded
      return
    }
  }

  i18n.addResourceBundle(
    locale,
    'translation',
    deepMergeWithFallback(fallbackLocale, mod.default),
    true,
    true
  )
  loadedLocales.add(locale)
}

/**
 * Switches the active language, fetching that locale's translation bundle
 * first if it hasn't been loaded yet. Use this instead of calling
 * `i18n.changeLanguage` directly for any locale that isn't 'en'.
 */
export async function changeLanguageLazy(locale: Locale): Promise<void> {
  await loadLocaleResource(locale)
  await i18n.changeLanguage(locale)
}

export default i18n
export { availableLocales, defaultLocale }
export type { Locale }
