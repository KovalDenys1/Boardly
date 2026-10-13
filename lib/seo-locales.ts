import { availableLocales, defaultLocale, type Locale } from '@/locales/meta'

/**
 * Locales the marketing pages are served at on their own URL (#928, #1394).
 * English stays unprefixed; `no` joins in a later part of #928.
 */
export const SEO_LOCALES = ['en', 'ru', 'uk'] as const
export type SeoLocale = (typeof SEO_LOCALES)[number]

const BASE = 'https://boardly.online'
const PREFIXED = SEO_LOCALES.filter((locale) => locale !== defaultLocale)

export function localizedPath(path: string, locale: SeoLocale): string {
  if (locale === defaultLocale) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

export function pathLocale(pathname: string): SeoLocale | null {
  const first = pathname.split('/')[1] ?? ''
  return (PREFIXED as readonly string[]).includes(first) ? (first as SeoLocale) : null
}

/** The page's path with any locale prefix taken off. */
export function unlocalizedPath(pathname: string): string {
  const locale = pathLocale(pathname)
  if (!locale) return pathname
  return pathname.slice(locale.length + 1) || '/'
}

/** `alternates.languages` for a page: every served locale plus x-default, identical from each version. */
export function languageAlternates(pathname: string): Record<SeoLocale | 'x-default', string> {
  const path = unlocalizedPath(pathname)
  const entries = SEO_LOCALES.map((locale) => [locale, `${BASE}${localizedPath(path, locale)}`] as const)
  return {
    ...(Object.fromEntries(entries) as Record<SeoLocale, string>),
    'x-default': `${BASE}${path}`,
  }
}

/** A prefixed URL renders its own locale whatever the visitor stored; elsewhere the stored choice stands. */
export function resolvePageLocale({ pathname, stored }: { pathname: string; stored: string | null }): Locale {
  const fromPath = pathLocale(pathname)
  if (fromPath) return fromPath
  return stored && (availableLocales as readonly string[]).includes(stored) ? (stored as Locale) : defaultLocale
}
