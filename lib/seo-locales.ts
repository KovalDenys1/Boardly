import { defaultLocale, type Locale } from '@/locales/meta'

/**
 * Locales the marketing pages are served at on their own URL (#928, #1394, #1610).
 * English stays unprefixed.
 */
export const SEO_LOCALES = ['en', 'ru', 'uk', 'no', 'de', 'es'] as const
export type SeoLocale = (typeof SEO_LOCALES)[number]

/** The locales with a URL prefix of their own. */
export const PREFIXED_LOCALES = ['ru', 'uk', 'no', 'de', 'es'] as const satisfies readonly SeoLocale[]
export type PrefixedLocale = (typeof PREFIXED_LOCALES)[number]

/** The languages the guides are written in (#1583). German and Spanish pages link the English guides. */
export const GUIDE_LOCALES = ['en', 'ru', 'uk', 'no'] as const satisfies readonly SeoLocale[]
export type GuideLocale = (typeof GUIDE_LOCALES)[number]
export type PrefixedGuideLocale = Exclude<GuideLocale, 'en'>

/** The language code in hreflang and `<html lang>`: the Norwegian text is Bokmål, ISO 639-1 `nb`. */
export const HREFLANG = { en: 'en', ru: 'ru', uk: 'uk', no: 'nb', de: 'de', es: 'es' } as const satisfies Record<SeoLocale, string>
export type Hreflang = (typeof HREFLANG)[SeoLocale]

export const OG_LOCALES: Record<SeoLocale, string> = {
  en: 'en_US',
  ru: 'ru_RU',
  uk: 'uk_UA',
  no: 'nb_NO',
  de: 'de_DE',
  es: 'es_ES',
}

const BASE = 'https://boardly.online'

export function isSeoLocale(value: string): value is SeoLocale {
  return (SEO_LOCALES as readonly string[]).includes(value)
}

export function isGuideLocale(value: string): value is GuideLocale {
  return (GUIDE_LOCALES as readonly string[]).includes(value)
}

/** The language a page in `locale` shows the guides in: its own where they are written in it, English otherwise. */
export function guideLocaleFor(locale: SeoLocale | null): GuideLocale {
  return locale && isGuideLocale(locale) ? locale : 'en'
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

/** The locales a page is served in: all of them for `/`, `/games` and each game's page, the guide languages for `/guides` and each guide. */
export function pageLocales(path: string): readonly SeoLocale[] {
  if (path === '/' || /^\/games(\/[^/]+)?$/.test(path)) return SEO_LOCALES
  if (/^\/guides(\/[^/]+)?$/.test(path)) return GUIDE_LOCALES
  return [defaultLocale]
}

/** `alternates.languages` for a page: every locale it is served in plus x-default, identical from each version. */
export function languageAlternates(pathname: string): Partial<Record<Hreflang, string>> & Record<'en' | 'x-default', string> {
  const path = unlocalizedPath(pathname)
  const entries = pageLocales(path).map((locale) => [HREFLANG[locale], `${BASE}${localizedPath(path, locale)}`] as const)
  return {
    ...(Object.fromEntries(entries) as Record<'en', string>),
    'x-default': `${BASE}${path}`,
  }
}

/** The locale whose pages carry this hreflang code: `nb` is `no`. */
export function localeForHreflang(code: string): string {
  return SEO_LOCALES.find((locale) => HREFLANG[locale] === code) ?? code
}

/** Whether `path` has a localized URL – in `locale` when one is given, in any language but English otherwise. */
export function isLocalizedPage(path: string, locale?: SeoLocale): boolean {
  const locales = pageLocales(path)
  return locale ? locales.includes(locale) : locales.length > 1
}

/** An unprefixed href as the page in `locale` links it: localized when the target has a URL in that language. */
export function localizeHref(href: string, locale: SeoLocale): string {
  const split = href.search(/[?#]/)
  const path = split === -1 ? href : href.slice(0, split)
  const rest = split === -1 ? '' : href.slice(split)
  return isLocalizedPage(path, locale) ? `${localizedPath(path, locale)}${rest}` : href
}

/** Where the language menu on a prefixed page goes: that language's URL, or the English one where the stored choice applies. */
export function localeSwitchHref(pathname: string, locale: Locale): string {
  const path = unlocalizedPath(pathname)
  return isSeoLocale(locale) && isLocalizedPage(path, locale) ? localizedPath(path, locale) : path
}
