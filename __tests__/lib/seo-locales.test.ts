import {
  SEO_LOCALES,
  isLocalizedPage,
  languageAlternates,
  localeSwitchHref,
  localizeHref,
  localizedPath,
  pathLocale,
} from '@/lib/seo-locales'
import { serverTranslator } from '@/lib/server-i18n'

/**
 * #1394: the server renders a locale for /ru/... and /uk/... on /, /games and
 * /games/<game>. These are the pieces every such page is built on: the URL a
 * locale lives at, the hreflang set it publishes, the links between its pages,
 * and a translator the server can use without the browser singleton.
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

describe('which pages have localized URLs (#1394)', () => {
  it('is /, /games and a game page, nothing below or beside them', () => {
    expect(isLocalizedPage('/')).toBe(true)
    expect(isLocalizedPage('/games')).toBe(true)
    expect(isLocalizedPage('/games/alias')).toBe(true)
    expect(isLocalizedPage('/games/alias/lobbies')).toBe(false)
    expect(isLocalizedPage('/guides')).toBe(false)
    expect(isLocalizedPage('/lobby/ABCD')).toBe(false)
  })
})

describe('links on a localized page (#1394)', () => {
  it('stay in the page language for pages that have one, query and fragment kept', () => {
    expect(localizeHref('/games', 'ru')).toBe('/ru/games')
    expect(localizeHref('/games/yahtzee#strategy', 'uk')).toBe('/uk/games/yahtzee#strategy')
    expect(localizeHref('/?ref=nav', 'ru')).toBe('/ru?ref=nav')
  })

  it('leave every other page on its English URL', () => {
    expect(localizeHref('/games/yahtzee/lobbies', 'ru')).toBe('/games/yahtzee/lobbies')
    expect(localizeHref('/guides/how-to-play-yahtzee', 'ru')).toBe('/guides/how-to-play-yahtzee')
    expect(localizeHref('/games', 'en')).toBe('/games')
  })
})

describe('switching language on a prefixed page (#1394)', () => {
  it('goes to the chosen language version of the same page', () => {
    expect(localeSwitchHref('/ru/games/alias', 'en')).toBe('/games/alias')
    expect(localeSwitchHref('/ru/games/alias', 'uk')).toBe('/uk/games/alias')
    expect(localeSwitchHref('/uk', 'ru')).toBe('/ru')
  })

  it('takes a locale without its own URL to the English URL, where the stored choice applies', () => {
    expect(localeSwitchHref('/ru/games', 'de')).toBe('/games')
    expect(localeSwitchHref('/uk', 'no')).toBe('/')
  })
})
