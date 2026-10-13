import {
  SEO_LOCALES,
  languageAlternates,
  localizedPath,
  pathLocale,
  resolvePageLocale,
} from '@/lib/seo-locales'
import { serverTranslator } from '@/lib/server-i18n'

/**
 * #1394: the server renders a locale for /ru/... and /uk/... on /, /games and
 * /games/<game>. These are the pieces every such page is built on: the URL a
 * locale lives at, the hreflang set it publishes, which language wins, and a
 * translator the server can use without the browser singleton.
 */

describe('localized paths (#1394)', () => {
  it('prefixes every locale but English', () => {
    expect(localizedPath('/', 'en')).toBe('/')
    expect(localizedPath('/', 'ru')).toBe('/ru')
    expect(localizedPath('/games', 'uk')).toBe('/uk/games')
    expect(localizedPath('/games/alias', 'ru')).toBe('/ru/games/alias')
  })

  it('reads the locale back off a path, and only a served one', () => {
    expect(pathLocale('/ru/games/alias')).toBe('ru')
    expect(pathLocale('/uk')).toBe('uk')
    expect(pathLocale('/games/alias')).toBeNull()
    expect(pathLocale('/no/games')).toBeNull()
    expect(pathLocale('/russia')).toBeNull()
  })
})

describe('hreflang alternates (#1394)', () => {
  const pages = ['/', '/games', '/games/alias']

  it('names every served locale and x-default, as absolute URLs', () => {
    expect(languageAlternates('/games/alias')).toEqual({
      en: 'https://boardly.online/games/alias',
      ru: 'https://boardly.online/ru/games/alias',
      uk: 'https://boardly.online/uk/games/alias',
      'x-default': 'https://boardly.online/games/alias',
    })
  })

  it('publishes the same set from every language version of a page', () => {
    for (const path of pages) {
      const set = languageAlternates(path)
      for (const locale of SEO_LOCALES) {
        const version = new URL(set[locale]).pathname
        expect(languageAlternates(version)).toEqual(set)
      }
    }
  })
})

describe('which language a page renders in (#1394)', () => {
  it('lets the path beat a stored preference', () => {
    expect(resolvePageLocale({ pathname: '/ru/games/alias', stored: 'en' })).toBe('ru')
    expect(resolvePageLocale({ pathname: '/uk/games', stored: 'ru' })).toBe('uk')
  })

  it('keeps the stored preference on an unprefixed page', () => {
    expect(resolvePageLocale({ pathname: '/games/alias', stored: 'no' })).toBe('no')
    expect(resolvePageLocale({ pathname: '/games/alias', stored: null })).toBe('en')
  })
})

describe('server translator (#1394)', () => {
  it('renders Russian and Ukrainian on the server', () => {
    expect(serverTranslator('ru')('games.alias.name')).toBe('Алиас')
    expect(serverTranslator('uk')('games.alias.name')).not.toBe(serverTranslator('en')('games.alias.name'))
  })

  it('keeps each locale to itself when they interleave', () => {
    const ru = serverTranslator('ru')
    const en = serverTranslator('en')
    const uk = serverTranslator('uk')
    expect([ru('games.alias.name'), en('games.alias.name'), ru('games.alias.name')]).toEqual([
      'Алиас',
      en('games.alias.name'),
      'Алиас',
    ])
    expect(uk('games.alias.name')).not.toBe('Алиас')
  })

  it('falls back to English for a key a locale lacks', () => {
    expect(serverTranslator('ru')('__missing__.key')).toBe('__missing__.key')
  })
})
