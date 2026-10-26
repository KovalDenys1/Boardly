import en from './en'
import uk from './uk'
import no from './no'
import ru from './ru'
import de from './de'
import es from './es'

export const locales = {
  en,
  uk,
  no,
  ru,
  de,
  es,
} as const

export { availableLocales, defaultLocale, localeNames } from './meta'
export type { Locale } from './meta'

export { default as en } from './en'
export { default as uk } from './uk'
export { default as no } from './no'
export { default as ru } from './ru'
export { default as de } from './de'
export { default as es } from './es'
export type { Translation } from './en'
