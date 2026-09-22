import { readFileSync } from 'node:fs'
import path from 'node:path'
import sitemap from '@/app/sitemap'
import { getCatalogGames } from '@/lib/game-catalog'
import { getGameCanonical } from '@/lib/game-seo'
import { ALL_GUIDES } from '@/lib/guides-catalog'
import { ROUTE_UPDATED, getRouteUpdated, type DatedRoute } from '@/lib/route-dates'

const BASE = 'https://boardly.online'
const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')
const pathOf = (url: string) => url.slice(BASE.length) || '/'
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

describe('sitemap (#922)', () => {
  const entries = sitemap()
  const guidePaths = new Set(ALL_GUIDES.map((g) => `/guides/${g.slug}`))

  it('takes every non-guide lastModified from lib/route-dates.ts', () => {
    const nonGuides = entries.filter((e) => !guidePaths.has(pathOf(e.url)))
    expect(nonGuides.length).toBeGreaterThan(0)
    for (const entry of nonGuides) {
      const route = pathOf(entry.url) as DatedRoute
      expect(ROUTE_UPDATED[route]).toMatch(ISO_DAY)
      expect(getRouteUpdated(route)).toMatch(ISO_DAY)
      expect(entry.lastModified).toEqual(new Date(getRouteUpdated(route)))
    }
    // and every dated route is in the sitemap, so the map never carries dead keys
    const urls = new Set(entries.map((e) => pathOf(e.url)))
    for (const route of Object.keys(ROUTE_UPDATED)) expect(urls.has(route)).toBe(true)
  })

  it('dates an index page no earlier than the newest page it lists', () => {
    // /games read 2026-09-07 for two weeks after two games shipped on
    // 2026-09-21: the index's own date is a floor, the children lift it.
    const gameDates = Object.entries(ROUTE_UPDATED)
      .filter(([route]) => route.startsWith('/games/'))
      .map(([, date]) => date)
    expect(gameDates.length).toBeGreaterThan(0)
    for (const date of gameDates) expect(getRouteUpdated('/games') >= date).toBe(true)
    expect(getRouteUpdated('/games') >= ROUTE_UPDATED['/games']).toBe(true)

    for (const guide of ALL_GUIDES) expect(getRouteUpdated('/guides') >= guide.updated).toBe(true)
    expect(getRouteUpdated('/guides') >= ROUTE_UPDATED['/guides']).toBe(true)

    // and a leaf route is its own date, nothing derived
    expect(getRouteUpdated('/games/yahtzee')).toBe(ROUTE_UPDATED['/games/yahtzee'])
  })

  it('takes every guide lastModified from the guide catalog', () => {
    for (const guide of ALL_GUIDES) {
      const entry = entries.find((e) => pathOf(e.url) === `/guides/${guide.slug}`)
      expect(entry?.lastModified).toEqual(new Date(guide.updated))
    }
  })

  it('has no hand-typed dates and no duplicate URLs', () => {
    expect(read('app/sitemap.ts')).not.toMatch(/lastModified:\s*['"]/)
    expect(new Set(entries.map((e) => e.url)).size).toBe(entries.length)
  })

  it('gives every URL a self canonical on its own page, none on the root layout', () => {
    expect(read('app/layout.tsx')).not.toMatch(/canonical:/)
    // #929: a game page's canonical comes from its catalog entry, so the page
    // names its game and lib/game-seo.ts builds the URL. Everything else still
    // carries the literal.
    const gameIdByRoute = new Map(
      getCatalogGames()
        .filter((game) => game.seo && game.route)
        .map((game) => [game.route!.replace(/\/lobbies$/, ''), game.id])
    )
    for (const entry of entries) {
      const route = pathOf(entry.url)
      const source = read(route === '/' ? 'app/page.tsx' : `app${route}/page.tsx`)
      const gameId = gameIdByRoute.get(route)
      if (gameId) {
        expect(source).toContain(`buildGameMetadata('${gameId}'`)
        expect(getGameCanonical(gameId)).toBe(entry.url)
        continue
      }
      const expected = route === '/' ? "canonical: '/'" : `canonical: '${BASE}${route}'`
      expect(source).toContain(expected)
    }
  })

  it('derives every guide Article.dateModified from the catalog', () => {
    for (const guide of ALL_GUIDES) {
      const source = read(`app/guides/${guide.slug}/page.tsx`)
      expect(source).toContain(`dateModified: getGuideBySlug('${guide.slug}').updated`)
      expect(source).not.toMatch(/dateModified:\s*['"]/)
    }
  })
})
