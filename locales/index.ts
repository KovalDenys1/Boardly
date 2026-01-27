import en from './en'
import uk from './uk'

export const locales = {
  en,
  uk,
} as const

export const availableLocales = ['en', 'uk'] as const
export type Locale = (typeof availableLocales)[number]
export const defaultLocale: Locale = 'en'

export { default as en } from './en'
export { default as uk } from './uk'
export type { Translation } from './en'
