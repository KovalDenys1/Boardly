export const availableLocales = ['en', 'uk', 'no', 'ru', 'de', 'es'] as const
export type Locale = (typeof availableLocales)[number]
export const defaultLocale: Locale = 'en'

// Endonyms, the same in every locale: a reader who cannot read the current language still has to find "Deutsch".
export const localeNames: Record<Locale, { badge: string; name: string }> = {
  en: { badge: 'EN', name: 'English' },
  uk: { badge: 'UA', name: 'Українська' },
  no: { badge: 'NO', name: 'Norsk' },
  ru: { badge: 'RU', name: 'Русский' },
  de: { badge: 'DE', name: 'Deutsch' },
  es: { badge: 'ES', name: 'Español' },
}
