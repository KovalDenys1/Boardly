import { defaultLocale, type Locale } from '@/locales/meta'

/**
 * Locales the marketing pages are served at on their own URL (#928, #1394).
 * English stays unprefixed; `no` joins in a later part of #928.
 */
export const SEO_LOCALES = ['en', 'ru', 'uk'] as const
export type SeoLocale = (typeof SEO_LOCALES)[number]

/** The locales with a URL prefix of their own. */
export const PREFIXED_LOCALES = ['ru', 'uk'] as const satisfies readonly SeoLocale[]
export type PrefixedLocale = (typeof PREFIXED_LOCALES)[number]

export const OG_LOCALES: Record<SeoLocale, string> = { en: 'en_US', ru: 'ru_RU', uk: 'uk_UA' }

const BASE = 'https://boardly.online'

export function isSeoLocale(value: string): value is SeoLocale {
  return (SEO_LOCALES as readonly string[]).includes(value)
}

export function localizedPath(path: string, locale: SeoLocale): string {
  if (locale === defaultLocale) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

export function pathLocale(pathname: string): PrefixedLocale | null {
  const first = pathname.split('/')[1] ?? ''
  return (PREFIXED_LOCALES as readonly string[]).includes(first) ? (first as PrefixedLocale) : null
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

/** The pages served at /ru/... and /uk/... as well: `/`, `/games` and each game's page. */
export function isLocalizedPage(path: string): boolean {
  return path === '/' || path === '/games' || /^\/games\/[^/]+$/.test(path)
}

/** An unprefixed href as the page in `locale` links it: localized when the target has a localized URL. */
export function localizeHref(href: string, locale: SeoLocale): string {
  const split = href.search(/[?#]/)
  const path = split === -1 ? href : href.slice(0, split)
  const rest = split === -1 ? '' : href.slice(split)
  return isLocalizedPage(path) ? `${localizedPath(path, locale)}${rest}` : href
}

/** Where the language menu on a prefixed page goes: that language's URL, or the English one where the stored choice applies. */
export function localeSwitchHref(pathname: string, locale: Locale): string {
  const path = unlocalizedPath(pathname)
  return isSeoLocale(locale) ? localizedPath(path, locale) : path
}
