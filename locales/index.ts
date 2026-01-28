import en from './en'
import uk from './uk'
import no from './no'
import ru from './ru'

export const locales = {
  en,
  uk,
  no,
  ru,
} as const

export const availableLocales = ['en', 'uk', 'no', 'ru'] as const
export type Locale = (typeof availableLocales)[number]
export const defaultLocale: Locale = 'en'

export { default as en } from './en'
export { default as uk } from './uk'
export { default as no } from './no'
export { default as ru } from './ru'
export type { Translation } from './en'
