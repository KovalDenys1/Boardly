import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'

import { languageAlternates } from '@/lib/seo-locales'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

jest.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ variable: '--bd-font-display', className: '' }),
  Inter: () => ({ className: '' }),
}))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('@/components/AnnouncementBanner', () => ({ AnnouncementBanner: () => null }))
jest.mock('@/app/providers', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}))
jest.mock('@/lib/server/premium-pricing', () => ({
  getPremiumPricing: async () => ({ monthly: null, yearly: null }),
}))

const trees = {
  ru: {
    layout: require('@/app/ru/layout'),
    home: require('@/app/ru/page'),
    games: require('@/app/ru/games/page'),
    game: require('@/app/ru/games/[game]/page'),
  },
  uk: {
    layout: require('@/app/uk/layout'),
    home: require('@/app/uk/page'),
    games: require('@/app/uk/games/page'),
    game: require('@/app/uk/games/[game]/page'),
  },
}
const LOCALES = ['ru', 'uk'] as const
const siteHome = require('@/app/(site)/page')
const siteGames = require('@/app/(site)/games/page')
const { buildGameJsonLd, buildGameMetadata, gameIdForSlug } = require('@/lib/game-seo')
const sitemap = require('@/app/sitemap').default

const BASE = 'https://boardly.online'
const CYRILLIC = /[А-Яа-яЁёІіЇїЄєҐґ]/
const appDir = path.join(process.cwd(), 'app')

const gameParams = (game: string) => ({ params: Promise.resolve({ game }) })
const gameMetadata = (locale: 'ru' | 'uk', game: string): Promise<Metadata> =>
  trees[locale].game.generateMetadata(gameParams(game))

function pageFilesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = path.join(dir, entry)
    const relative = prefix ? `${prefix}/${entry}` : entry
    if (statSync(absolute).isDirectory()) return pageFilesUnder(absolute, relative)
    return entry === 'page.tsx' ? [relative] : []
  })
}

const siteGameSlugs = readdirSync(path.join(appDir, '(site)', 'games')).filter((entry) => {
  const page = path.join(appDir, '(site)', 'games', entry, 'page.tsx')
  try {
    return statSync(page).isFile()
  } catch {
    return false
  }
})

const gameSlugs = (trees.ru.game.generateStaticParams() as { game: string }[]).map((p) => p.game)

describe('the /ru and /uk set (#1394)', () => {
  it('gives ru and uk a URL prefix and no other language one', () => {
    const prefixes = readdirSync(appDir).filter(
      (entry) => statSync(path.join(appDir, entry)).isDirectory() && !entry.startsWith('(') && !['api', 'og'].includes(entry)
    )
    expect(prefixes.sort()).toEqual(['ru', 'uk'])
  })

  it('has /, /games and /games/<game> under each prefix and nothing else, so /ru/guides/... is a 404', () => {
    for (const locale of LOCALES) {
      expect(pageFilesUnder(path.join(appDir, locale)).sort()).toEqual([
        'games/[game]/page.tsx',
        'games/page.tsx',
        'page.tsx',
      ])
      expect(trees[locale].game.dynamicParams).toBe(false)
    }
  })

  it('builds /uk exactly like /ru', () => {
    const capital = (word: string) => word[0].toUpperCase() + word.slice(1)
    const swap = (source: string, from: string, to: string) =>
      source.split(from).join(to).split(capital(from)).join(capital(to))
    for (const file of ['layout.tsx', ...pageFilesUnder(path.join(appDir, 'ru'))]) {
      const ruSource = readFileSync(path.join(appDir, 'ru', file), 'utf8')
      const ukSource = readFileSync(path.join(appDir, 'uk', file), 'utf8')
      expect(swap(ukSource, 'uk', 'ru')).toBe(ruSource)
    }
  })

  it('renders a localized page for every game page the English site has', () => {
    expect(siteGameSlugs.length).toBeGreaterThan(0)
    expect([...gameSlugs].sort()).toEqual([...siteGameSlugs].sort())
  })

  it('keeps every page in the set prerendered', () => {
    for (const locale of LOCALES) {
      expect(trees[locale].home.dynamic).toBe('force-static')
      expect(trees[locale].home.revalidate).toBe(siteHome.revalidate)
    }
  })
})

describe('metadata of a localized page (#1394)', () => {
  it('gives /ru/games/alias a Russian title and description', async () => {
    const meta = await gameMetadata('ru', 'alias')

    expect(meta.title).toBe(ru.games.alias.seo.title)
    expect(meta.description).toBe(ru.games.alias.seo.description)
    expect(String(meta.title)).toMatch(CYRILLIC)
    expect(meta.alternates?.canonical).toBe(`${BASE}/ru/games/alias`)
    expect(meta.openGraph).toMatchObject({ locale: 'ru_RU', url: `${BASE}/ru/games/alias` })
  })

  it('gives /uk and /uk/games their Ukrainian titles', async () => {
    const home: Metadata = trees.uk.home.metadata
    const games: Metadata = trees.uk.games.metadata

    expect(home.title).toEqual({ absolute: uk.home.seo.title })
    expect(home.description).toBe(uk.home.seo.description)
    expect(games.title).toBe(uk.games.catalogSeo.title)
    expect(games.description).toBe(uk.games.catalogSeo.description)
    expect(games.alternates?.canonical).toBe(`${BASE}/uk/games`)
  })

  it('names the locale on the localized root layout', async () => {
    const meta: Metadata = trees.ru.layout.metadata
    expect(meta.openGraph).toMatchObject({ locale: 'ru_RU' })
    expect(JSON.stringify(meta)).not.toContain('Free Online Board Games with Friends')
  })
})

describe('structured data of a localized game page (#1394)', () => {
  it('answers in the page language, at the page URL', () => {
    const [game, breadcrumbs, faq] = buildGameJsonLd('alias', 'ru')

    expect(game.url).toBe(`${BASE}/ru/games/alias`)
    expect(game.name).toBe(ru.games.alias.name)
    expect(breadcrumbs.itemListElement.map((item: { item: string }) => item.item)).toEqual([
      `${BASE}/ru`,
      `${BASE}/ru/games`,
      `${BASE}/ru/games/alias`,
    ])
    expect(faq.mainEntity[0].name).toBe(ru.games.alias.seo.question)
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe(ru.games.alias.seo.answer)
  })

  it('stays English on the English page', () => {
    const [game, , faq] = buildGameJsonLd('alias')
    expect(game.url).toBe(`${BASE}/games/alias`)
    expect(faq.mainEntity[0].name).not.toMatch(CYRILLIC)
  })
})

describe('hreflang across the three URLs of a page (#1394)', () => {
  const expected = (pathname: string) => ({
    en: `${BASE}${pathname}`,
    ru: `${BASE}${pathname === '/' ? '/ru' : `/ru${pathname}`}`,
    uk: `${BASE}${pathname === '/' ? '/uk' : `/uk${pathname}`}`,
    'x-default': `${BASE}${pathname}`,
  })

  it('is identical on /, /ru and /uk', async () => {
    const versions: Metadata[] = [
      siteHome.metadata,
      trees.ru.home.metadata,
      trees.uk.home.metadata,
    ]
    for (const meta of versions) expect(meta.alternates?.languages).toEqual(expected('/'))
  })

  it('is identical on /games, /ru/games and /uk/games', async () => {
    const versions: Metadata[] = [
      siteGames.metadata,
      trees.ru.games.metadata,
      trees.uk.games.metadata,
    ]
    for (const meta of versions) expect(meta.alternates?.languages).toEqual(expected('/games'))
  })

  it('names each localized page as its own canonical', async () => {
    for (const locale of LOCALES) {
      const home: Metadata = trees[locale].home.metadata
      const games: Metadata = trees[locale].games.metadata
      expect(home.alternates?.canonical).toBe(expected('/')[locale])
      expect(games.alternates?.canonical).toBe(expected('/games')[locale])
      for (const slug of gameSlugs) {
        const game = await gameMetadata(locale, slug)
        expect(game.alternates?.canonical).toBe(expected(`/games/${slug}`)[locale])
      }
    }
  })

  it('is identical on every game page, with x-default on the English one', async () => {
    for (const slug of gameSlugs) {
      const versions: Metadata[] = [
        buildGameMetadata(gameIdForSlug(slug)),
        await gameMetadata('ru', slug),
        await gameMetadata('uk', slug),
      ]
      for (const meta of versions) expect(meta.alternates?.languages).toEqual(expected(`/games/${slug}`))
    }
  })
})

describe('sitemap alternates (#1394)', () => {
  type Entry = { url: string; alternates?: { languages?: Record<string, string> } }
  const entries: Entry[] = sitemap()
  const byUrl = new Map(entries.map((entry) => [entry.url, entry]))
  const localizedPaths = ['/', '/games', ...gameSlugs.map((slug) => `/games/${slug}`)]

  it('lists all three URLs of every localized page, each with the full hreflang set', () => {
    for (const pathname of localizedPaths) {
      const set = languageAlternates(pathname)
      for (const url of [set.en, set.ru, set.uk]) {
        expect(byUrl.get(url)?.alternates?.languages).toEqual(set)
      }
    }
  })

  it('lists no /ru or /uk URL outside the set', () => {
    const localized = entries.filter((entry) => /^https:\/\/boardly\.online\/(ru|uk)(\/|$)/.test(entry.url))
    const allowed = new Set(localizedPaths.flatMap((p) => [languageAlternates(p).ru, languageAlternates(p).uk]))
    expect(localized.length).toBe(allowed.size)
    for (const entry of localized) expect(allowed.has(entry.url)).toBe(true)
  })
})
