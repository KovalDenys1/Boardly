import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import {
  getCatalogEntryById,
  getCatalogGames,
  getGameSeo,
  hasBotSupport,
} from '@/lib/game-catalog'
import {
  buildGameJsonLd,
  buildGameMetadata,
  englishText,
  getGameCanonical,
  renderedTitle,
} from '@/lib/game-seo'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

const root = process.cwd()

/**
 * Every `/games/<slug>` route with a detail page of its own. `sketch-and-guess`
 * joined them in #1036; the slug is the one in the catalog entry's `route`, not
 * the entry's id, which for this game is `guess-my-drawing`.
 */
const PAGE_SLUGS = readdirSync(path.join(root, 'app/games'))
  .filter((entry) => statSync(path.join(root, 'app/games', entry)).isDirectory())
  .filter((entry) => existsSync(path.join(root, 'app/games', entry, 'page.tsx')))

const SEO_GAMES = getCatalogGames().filter((game) => game.seo)

function localeValue(locale: object, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node as Record<string, unknown> | undefined)?.[part],
    locale
  )
}

describe('game SEO catalog (#929)', () => {
  it('gives every game that has a page an seo block, and nothing else one', () => {
    const slugsWithSeo = SEO_GAMES.map((game) => game.route!.replace(/^\/games\//, '').replace(/\/lobbies$/, ''))
    expect([...slugsWithSeo].sort()).toEqual([...PAGE_SLUGS].sort())
  })

  it('keeps every rendered title under 60 characters', () => {
    for (const game of SEO_GAMES) {
      const title = renderedTitle(game.seo!)
      // The root layout appends " | Boardly", so the tab and the search result
      // show more than lib/game-catalog.ts does.
      expect(title).toBe(`${game.seo!.title} | Boardly`)
      expect(title.length).toBeLessThan(60)
    }
  })

  it('keeps every description inside what a search result shows', () => {
    for (const game of SEO_GAMES) {
      expect(game.seo!.description.length).toBeGreaterThan(110)
      expect(game.seo!.description.length).toBeLessThanOrEqual(160)
    }
  })

  it('uses the en dash, never the em dash, in copy written for Denys', () => {
    for (const game of SEO_GAMES) {
      const { title, description, schemaDescription, synonyms, genre } = game.seo!
      const copy = [title, description, schemaDescription, ...synonyms, ...genre].join(' ')
      expect(copy).not.toContain('—')
    }
    for (const locale of [en, no, ru, uk]) {
      for (const game of SEO_GAMES) {
        expect(localeValue(locale, game.seo!.questionKey)).not.toContain('—')
        expect(localeValue(locale, game.seo!.answerKey)).not.toContain('—')
      }
    }
  })

  it('gives each game distinct, lowercase search synonyms', () => {
    const seen = new Set<string>()
    for (const game of SEO_GAMES) {
      const { synonyms } = game.seo!
      expect(synonyms.length).toBeGreaterThanOrEqual(4)
      expect(new Set(synonyms).size).toBe(synonyms.length)
      for (const synonym of synonyms) {
        expect(synonym).toBe(synonym.toLowerCase())
        // Two pages competing for one phrase is two pages losing it.
        expect(seen.has(synonym)).toBe(false)
        seen.add(synonym)
      }
    }
  })

  it('serves the queries the search data actually shows', () => {
    // Last 90 days in SearchConsoleDaily: Yahtzee and Connect Four carry 1 534
    // of the site's impressions, and the head terms sit past position 50. These
    // are the specific phrases worth having.
    expect(getGameSeo('yahtzee')!.synonyms).toEqual(
      expect.arrayContaining(['yahtzee online free', 'play yahtzee online', 'yahtzee online with friends'])
    )
    expect(getGameSeo('connect-four')!.synonyms).toEqual(
      expect.arrayContaining(['connect 4 online', 'connect four online'])
    )
    // Both spellings have to be reachable from the Connect Four title itself.
    expect(getGameSeo('connect-four')!.title).toContain('Connect 4')
    // The ticket's two named additions.
    expect(getGameSeo('spy')!.synonyms).toEqual(
      expect.arrayContaining(['who is the spy game', 'find the imposter game', 'spyfall online free'])
    )
    expect(getGameSeo('memory')!.synonyms).toContain('memory game online multiplayer')
  })
})

describe('game FAQ sections (#1077)', () => {
  const WITH_FAQ = SEO_GAMES.filter((game) => game.seo!.faq)

  it('gives the pilot its seven product questions', () => {
    expect(getGameSeo('yahtzee')!.faq?.length).toBe(7)
  })

  it('ships at least three entries when it ships any, with no key repeated', () => {
    for (const game of WITH_FAQ) {
      const faq = game.seo!.faq!
      expect(faq.length).toBeGreaterThanOrEqual(3)
      const keys = faq.flatMap(({ questionKey, answerKey }) => [questionKey, answerKey])
      expect(new Set([...keys, game.seo!.questionKey, game.seo!.answerKey]).size).toBe(keys.length + 2)
    }
  })

  it('asks one question per entry and answers it in one paragraph, in all four locales', () => {
    for (const game of WITH_FAQ) {
      for (const { questionKey, answerKey } of game.seo!.faq!) {
        for (const [name, locale] of Object.entries({ en, no, ru, uk })) {
          const question = localeValue(locale, questionKey)
          const answer = localeValue(locale, answerKey)
          expect({ name, questionKey, type: typeof question }).toEqual({ name, questionKey, type: 'string' })
          expect({ name, answerKey, type: typeof answer }).toEqual({ name, answerKey, type: 'string' })
          expect((question as string).match(/\?/g)).toHaveLength(1)
          expect(question as string).toMatch(/\?$/)
          expect(answer as string).not.toContain('\n')
          expect(answer as string).not.toContain('—')
          expect(question as string).not.toContain('—')
          expect((answer as string).length).toBeGreaterThan(80)
          expect((answer as string).length).toBeLessThanOrEqual(320)
        }
      }
    }
  })

  it('renders the FAQ section from the catalog on the game page', () => {
    const source = readFileSync(path.join(root, 'app/games/components/GameDetailPage.tsx'), 'utf8')
    expect(source).toContain('seo?.faq')
    expect(source).toContain('id="faq"')
  })
})

describe('game direct answers (#929)', () => {
  it('asks one question and answers it in one paragraph, in all four locales', () => {
    for (const game of SEO_GAMES) {
      for (const [name, locale] of Object.entries({ en, no, ru, uk })) {
        const question = localeValue(locale, game.seo!.questionKey)
        const answer = localeValue(locale, game.seo!.answerKey)
        expect(typeof question).toBe('string')
        expect(typeof answer).toBe('string')
        expect(question as string).toMatch(/\?$/)
        // One question. If it needs two, the page needs two answers.
        expect((question as string).match(/\?/g)).toHaveLength(1)
        expect(answer as string).not.toContain('\n')
        expect((answer as string).length).toBeGreaterThan(80)
        expect((answer as string).length).toBeLessThanOrEqual(320)
        expect(name).toBeTruthy()
      }
    }
  })

  it('renders the answer above the facts on every game page', () => {
    const source = readFileSync(path.join(root, 'app/games/components/GameDetailPage.tsx'), 'utf8')
    expect(source).toContain('t(seo.questionKey)')
    expect(source).toContain('t(seo.answerKey)')
    expect(source.indexOf('t(seo.answerKey)')).toBeLessThan(source.indexOf('facts.map'))
  })
})

describe('game metadata and JSON-LD (#929)', () => {
  it('builds one canonical per game, matching its own route', () => {
    for (const game of SEO_GAMES) {
      const url = getGameCanonical(game.id)
      expect(url).toBe(`https://boardly.online${game.route!.replace(/\/lobbies$/, '')}`)
      expect(buildGameMetadata(game.id).alternates?.canonical).toBe(url)
    }
  })

  it('indexes the available games and keeps the in-development ones out', () => {
    expect(buildGameMetadata('yahtzee').robots).toEqual({ index: true, follow: true })
    // The opt-out itself, which outlives the games that needed it: it was how
    // /games/liars-party shipped from #872 until #873 released the game.
    expect(buildGameMetadata('liars-party', { index: false }).robots).toEqual({ index: false, follow: true })
    expect(buildGameMetadata('liars-party').robots).toEqual({ index: true, follow: true })

    // Which pages pass it is the part that must not go stale, so it is read off
    // the catalog rather than named here: a detail page is noindex exactly while
    // its game is not available. #873 flipped the last two, so no page passes the
    // option today - and the day an in-development game gets a page, this is the
    // line that asks it for the noindex.
    for (const game of SEO_GAMES) {
      const slug = game.route!.replace(/\/lobbies$/, '')
      const source = readFileSync(path.join(root, 'app', `${slug}/page.tsx`), 'utf8')
      expect({ slug, noindex: source.includes('{ index: false }') }).toEqual({
        slug,
        noindex: game.availability !== 'available',
      })
    }
  })

  it('takes the player range from the catalog, so the schema cannot outrun the page', () => {
    for (const game of SEO_GAMES) {
      const [videoGame] = buildGameJsonLd(game.id)
      const [min, max] = game.players.split('-').map(Number)
      expect(videoGame.numberOfPlayers).toEqual({
        '@type': 'QuantitativeValue',
        minValue: min,
        maxValue: max,
      })
    }
  })

  it('claims SinglePlayer exactly where the game has a bot', () => {
    // Memory and Rock Paper Scissors both said MultiPlayer only while both
    // had bots – the cost of eight hand-written copies of one block.
    for (const game of SEO_GAMES) {
      const [videoGame] = buildGameJsonLd(game.id)
      expect(videoGame.playMode).toEqual(
        hasBotSupport(game.gameType!) ? ['MultiPlayer', 'SinglePlayer'] : 'MultiPlayer'
      )
    }
    expect(buildGameJsonLd('memory')[0].playMode).toEqual(['MultiPlayer', 'SinglePlayer'])
    expect(buildGameJsonLd('alias')[0].playMode).toBe('MultiPlayer')
  })

  it('carries the direct answer first, then every catalog FAQ entry, and nothing else', () => {
    for (const game of SEO_GAMES) {
      const faq = buildGameJsonLd(game.id).find((schema) => schema['@type'] === 'FAQPage')!
      const entries = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[]
      // Structured data a visitor cannot see on the page is a violation: the
      // direct answer is above the fold and the rest is the page's #faq
      // section, both read from this same catalog entry.
      const expected = [
        { questionKey: game.seo!.questionKey, answerKey: game.seo!.answerKey },
        ...(game.seo!.faq ?? []),
      ]
      expect(entries).toHaveLength(expected.length)
      expected.forEach(({ questionKey, answerKey }, index) => {
        expect(entries[index].name).toBe(englishText(questionKey))
        expect(entries[index].acceptedAnswer.text).toBe(englishText(answerKey))
      })
    }
  })

  it('names the game the same way in the breadcrumb, the schema and the engine', () => {
    for (const game of SEO_GAMES) {
      const [videoGame, breadcrumb] = buildGameJsonLd(game.id)
      const trail = breadcrumb.itemListElement as { name: string; item: string }[]
      expect(trail).toHaveLength(3)
      expect(trail[2].name).toBe(videoGame.name)
      expect(trail[2].item).toBe(getGameCanonical(game.id))
      expect(videoGame.url).toBe(getGameCanonical(game.id))
    }
  })

  it('refuses a game that has no seo block', () => {
    expect(getGameSeo('words-mines')).toBeNull()
    expect(getCatalogEntryById('nope')).toBeNull()
    expect(() => buildGameMetadata('words-mines')).toThrow(/No SEO block/)
  })
})
