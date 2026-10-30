import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'

import { HREFLANG, languageAlternates } from '@/lib/seo-locales'
import de from '@/locales/de'
import es from '@/locales/es'
import no from '@/locales/no'
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
  no: {
    layout: require('@/app/no/layout'),
    home: require('@/app/no/page'),
    games: require('@/app/no/games/page'),
    game: require('@/app/no/games/[game]/page'),
  },
  de: {
    layout: require('@/app/de/layout'),
    home: require('@/app/de/page'),
    games: require('@/app/de/games/page'),
    game: require('@/app/de/games/[game]/page'),
  },
  es: {
    layout: require('@/app/es/layout'),
    home: require('@/app/es/page'),
    games: require('@/app/es/games/page'),
    game: require('@/app/es/games/[game]/page'),
  },
}
const LOCALES = ['ru', 'uk', 'no', 'de', 'es'] as const
type PrefixedTree = (typeof LOCALES)[number]
/** The prefixes the guides are written for (#1583); /de and /es have none (#1610). */
const GUIDE_TREES = ['ru', 'uk', 'no'] as const
const isGuideFile = (file: string) => file.startsWith('guides/')
const siteHome = require('@/app/(site)/page')
const siteGames = require('@/app/(site)/games/page')
const { buildGameJsonLd, buildGameMetadata, gameIdForSlug } = require('@/lib/game-seo')
const sitemap = require('@/app/sitemap').default

const BASE = 'https://boardly.online'
const CYRILLIC = /[А-Яа-яЁёІіЇїЄєҐґ]/
const appDir = path.join(process.cwd(), 'app')

const gameParams = (game: string) => ({ params: Promise.resolve({ game }) })
const gameMetadata = (locale: PrefixedTree, game: string): Promise<Metadata> =>
  trees[locale].game.generateMetadata(gameParams(game))

function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = path.join(dir, entry)
    const relative = prefix ? `${prefix}/${entry}` : entry
    return statSync(absolute).isDirectory() ? filesUnder(absolute, relative) : [relative]
  })
}

const pageFilesUnder = (dir: string) => filesUnder(dir).filter((file) => file.endsWith('page.tsx'))

const siteGameSlugs = readdirSync(path.join(appDir, '(site)', 'games')).filter((entry) => {
  const page = path.join(appDir, '(site)', 'games', entry, 'page.tsx')
  try {
    return statSync(page).isFile()
  } catch {
    return false
  }
})

const gameSlugs = (trees.ru.game.generateStaticParams() as { game: string }[]).map((p) => p.game)

describe('the /ru, /uk, /no, /de and /es set (#1394, #928, #1610)', () => {
  it('has six root layouts: the English site and one per language prefix, and no other prefix', () => {
    const roots = readdirSync(appDir).filter((entry) => existsSync(path.join(appDir, entry, 'layout.tsx')))
    expect(roots.sort()).toEqual(['(site)', 'de', 'es', 'no', 'ru', 'uk'])
    expect(existsSync(path.join(appDir, 'layout.tsx'))).toBe(false)
  })

  it('has /, /games and /games/<game> under each prefix, the guides only where they are written, and nothing else', () => {
    for (const locale of LOCALES) {
      const guides = (GUIDE_TREES as readonly string[]).includes(locale) ? ['guides/[slug]/page.tsx', 'guides/page.tsx'] : []
      expect(pageFilesUnder(path.join(appDir, locale)).sort()).toEqual(
        ['games/[game]/page.tsx', 'games/page.tsx', ...guides, 'page.tsx'].sort()
      )
      expect(trees[locale].game.dynamicParams).toBe(false)
    }
    for (const locale of ['de', 'es']) expect(existsSync(path.join(appDir, locale, 'guides'))).toBe(false)
  })

  it('builds every other prefix exactly like /ru, error page included, /de and /es without the guides', () => {
    expect(filesUnder(path.join(appDir, 'ru'))).toContain('error.tsx')
    const capital = (word: string) => word[0].toUpperCase() + word.slice(1)
    const swap = (source: string, from: string, to: string) =>
      source.split(from).join(to).split(capital(from)).join(capital(to))
    for (const locale of LOCALES.filter((locale) => locale !== 'ru')) {
      const hasGuides = (GUIDE_TREES as readonly string[]).includes(locale)
      const ruFiles = filesUnder(path.join(appDir, 'ru')).filter((file) => hasGuides || !isGuideFile(file))
      expect(filesUnder(path.join(appDir, locale)).sort()).toEqual(ruFiles.sort())
      for (const file of ruFiles) {
        const ruSource = readFileSync(path.join(appDir, 'ru', file), 'utf8')
        const source = readFileSync(path.join(appDir, locale, file), 'utf8')
        expect(swap(ruSource, 'ru', locale)).toBe(source)
      }
    }
  })

  it('serves each prefix with <html lang> set to the code its hreflang uses, nb for Norwegian', () => {
    for (const locale of LOCALES) {
      const root = trees[locale].layout.default({ children: null })
      expect(root.props).toMatchObject({ lang: HREFLANG[locale], pathLocale: locale })
    }
    expect(trees.no.layout.default({ children: null }).props.lang).toBe('nb')
    expect(trees.de.layout.default({ children: null }).props.lang).toBe('de')
    expect(trees.es.layout.default({ children: null }).props.lang).toBe('es')
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

  it('gives /no/games/yahtzee a Norwegian title and description that say Yatzy, and keeps it indexable', async () => {
    const meta = await gameMetadata('no', 'yahtzee')

    expect(meta.title).toBe(no.games.yahtzee.seo.title)
    expect(meta.description).toBe(no.games.yahtzee.seo.description)
    expect(String(meta.title)).toContain('Yatzy')
    expect(String(meta.description)).toContain('Yatzy')
    expect(meta.alternates?.canonical).toBe(`${BASE}/no/games/yahtzee`)
    expect(meta.openGraph).toMatchObject({ locale: 'nb_NO', url: `${BASE}/no/games/yahtzee` })
    expect(meta.robots).toMatchObject({ index: true, follow: true })
  })

  it('gives /no and /no/games their Norwegian titles', async () => {
    const home: Metadata = trees.no.home.metadata
    const games: Metadata = trees.no.games.metadata

    expect(home.title).toEqual({ absolute: no.home.seo.title })
    expect(home.description).toBe(no.home.seo.description)
    expect(games.title).toBe(no.games.catalogSeo.title)
    expect(games.description).toBe(no.games.catalogSeo.description)
    expect(games.alternates?.canonical).toBe(`${BASE}/no/games`)
  })

  it('gives /de/games/yahtzee and /es/games/spy their own title, description and canonical, indexable (#1610)', async () => {
    const yahtzee = await gameMetadata('de', 'yahtzee')
    expect(yahtzee.title).toBe(de.games.yahtzee.seo.title)
    expect(yahtzee.description).toBe(de.games.yahtzee.seo.description)
    expect(yahtzee.alternates?.canonical).toBe(`${BASE}/de/games/yahtzee`)
    expect(yahtzee.openGraph).toMatchObject({ locale: 'de_DE', url: `${BASE}/de/games/yahtzee` })
    expect(yahtzee.robots).toMatchObject({ index: true, follow: true })

    const spy = await gameMetadata('es', 'spy')
    expect(spy.title).toBe(es.games.spy.seo.title)
    expect(spy.description).toBe(es.games.spy.seo.description)
    expect(spy.alternates?.canonical).toBe(`${BASE}/es/games/spy`)
    expect(spy.openGraph).toMatchObject({ locale: 'es_ES', url: `${BASE}/es/games/spy` })
    expect(spy.robots).toMatchObject({ index: true, follow: true })
  })

  it('gives every /de and /es page a title and description of its own, none of them the English one (#1610)', async () => {
    for (const [locale, text] of [['de', de], ['es', es]] as const) {
      expect(trees[locale].home.metadata.title).toEqual({ absolute: text.home.seo.title })
      expect(trees[locale].games.metadata.title).toBe(text.games.catalogSeo.title)
      expect(trees[locale].games.metadata.description).toBe(text.games.catalogSeo.description)
      for (const slug of gameSlugs) {
        const english = buildGameMetadata(gameIdForSlug(slug))
        const meta = await gameMetadata(locale, slug)
        expect({ slug, locale, title: meta.title === english.title }).toEqual({ slug, locale, title: false })
        expect({ slug, locale, description: meta.description === english.description }).toEqual({ slug, locale, description: false })
      }
    }
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
    const noMeta: Metadata = trees.no.layout.metadata
    expect(noMeta.openGraph).toMatchObject({ locale: 'nb_NO', url: `${BASE}/no` })
    expect(JSON.stringify(noMeta)).not.toContain('Free Online Board Games with Friends')
    expect(trees.de.layout.metadata.openGraph).toMatchObject({ locale: 'de_DE', url: `${BASE}/de` })
    expect(trees.es.layout.metadata.openGraph).toMatchObject({ locale: 'es_ES', url: `${BASE}/es` })
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

  it('names Yatzy at the /no URL on the Norwegian Yahtzee page', () => {
    const [game, breadcrumbs] = buildGameJsonLd('yahtzee', 'no')

    expect(game.name).toBe('Yatzy')
    expect(game.url).toBe(`${BASE}/no/games/yahtzee`)
    expect(breadcrumbs.itemListElement.map((item: { item: string }) => item.item)).toEqual([
      `${BASE}/no`,
      `${BASE}/no/games`,
      `${BASE}/no/games/yahtzee`,
    ])
  })

  it('stays English on the English page', () => {
    const [game, , faq] = buildGameJsonLd('alias')
    expect(game.url).toBe(`${BASE}/games/alias`)
    expect(faq.mainEntity[0].name).not.toMatch(CYRILLIC)
  })
})

describe('hreflang across the six URLs of a page (#1394, #928, #1610)', () => {
  const prefixed = (prefix: string, pathname: string) => `${BASE}${pathname === '/' ? prefix : `${prefix}${pathname}`}`
  const expected = (pathname: string) => ({
    en: `${BASE}${pathname}`,
    ru: prefixed('/ru', pathname),
    uk: prefixed('/uk', pathname),
    nb: prefixed('/no', pathname),
    de: prefixed('/de', pathname),
    es: prefixed('/es', pathname),
    'x-default': `${BASE}${pathname}`,
  })
  const ownUrl = (locale: PrefixedTree, pathname: string) => prefixed(`/${locale}`, pathname)

  it('is identical on / and under every prefix', async () => {
    const versions: Metadata[] = [siteHome.metadata, ...LOCALES.map((locale) => trees[locale].home.metadata)]
    for (const meta of versions) expect(meta.alternates?.languages).toEqual(expected('/'))
  })

  it('is identical on /games and under every prefix', async () => {
    const versions: Metadata[] = [siteGames.metadata, ...LOCALES.map((locale) => trees[locale].games.metadata)]
    for (const meta of versions) expect(meta.alternates?.languages).toEqual(expected('/games'))
  })

  it('names each localized page as its own canonical', async () => {
    for (const locale of LOCALES) {
      const home: Metadata = trees[locale].home.metadata
      const games: Metadata = trees[locale].games.metadata
      expect(home.alternates?.canonical).toBe(ownUrl(locale, '/'))
      expect(games.alternates?.canonical).toBe(ownUrl(locale, '/games'))
      for (const slug of gameSlugs) {
        const game = await gameMetadata(locale, slug)
        expect(game.alternates?.canonical).toBe(ownUrl(locale, `/games/${slug}`))
      }
    }
  })

  it('is identical on every game page, with x-default on the English one', async () => {
    for (const slug of gameSlugs) {
      const versions: Metadata[] = [
        buildGameMetadata(gameIdForSlug(slug)),
        ...(await Promise.all(LOCALES.map((locale) => gameMetadata(locale, slug)))),
      ]
      for (const meta of versions) expect(meta.alternates?.languages).toEqual(expected(`/games/${slug}`))
    }
  })
})

describe('sitemap alternates (#1394)', () => {
  type Entry = { url: string; alternates?: { languages?: Record<string, string> } }
  const entries: Entry[] = sitemap()
  const byUrl = new Map(entries.map((entry) => [entry.url, entry]))
  const guideSlugs = (require('@/lib/guides-catalog').ALL_GUIDES as { slug: string }[]).map((guide) => guide.slug)
  const localizedPaths = [
    '/',
    '/games',
    ...gameSlugs.map((slug) => `/games/${slug}`),
    '/guides',
    ...guideSlugs.map((slug) => `/guides/${slug}`),
  ]

  it('lists every URL of every localized page, each with the full hreflang set: six for a game page, four for a guide', () => {
    for (const pathname of localizedPaths) {
      const set = languageAlternates(pathname)
      const urls = new Set(Object.values(set))
      expect({ pathname, size: urls.size }).toEqual({ pathname, size: pathname.startsWith('/guides') ? 4 : 6 })
      for (const url of urls) {
        expect(byUrl.get(url)?.alternates?.languages).toEqual(set)
      }
    }
    expect(byUrl.get(`${BASE}/no/games/yahtzee`)?.alternates?.languages).toMatchObject({
      nb: `${BASE}/no/games/yahtzee`,
      'x-default': `${BASE}/games/yahtzee`,
    })
    expect(byUrl.get(`${BASE}/de/games/yahtzee`)?.alternates?.languages).toMatchObject({
      de: `${BASE}/de/games/yahtzee`,
      es: `${BASE}/es/games/yahtzee`,
      'x-default': `${BASE}/games/yahtzee`,
    })
  })

  it('lists no prefixed URL outside the set, and no German or Spanish guide', () => {
    const localized = entries.filter((entry) => /^https:\/\/boardly\.online\/(ru|uk|no|de|es)(\/|$)/.test(entry.url))
    const allowed = new Set(
      localizedPaths.flatMap((p) => Object.values(languageAlternates(p)).filter((url) => /\/(ru|uk|no|de|es)(\/|$)/.test(url)))
    )
    expect(localized.length).toBe(allowed.size)
    for (const entry of localized) expect(allowed.has(entry.url)).toBe(true)
    expect(entries.filter((entry) => /\/(de|es)\/guides/.test(entry.url))).toEqual([])
  })
})
