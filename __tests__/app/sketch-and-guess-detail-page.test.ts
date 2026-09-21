import { readFileSync } from 'node:fs'
import path from 'node:path'

import { buildGameJsonLd, buildGameMetadata, englishText } from '@/lib/game-seo'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

/**
 * `/games/sketch-and-guess` (#1036). The page is built from the catalog entry
 * #1035 filled in, so these tests are about the three things a hand-written
 * page gets wrong: a canonical that does not match where the page lives, a
 * schema that claims a player count or a bot the game does not have, and a
 * translation key that exists in English and nowhere else.
 */

const root = process.cwd()
const PAGE = path.join(root, 'app/games/sketch-and-guess/page.tsx')
const CONTENT = path.join(root, 'app/games/sketch-and-guess/SketchAndGuessDetailContent.tsx')

const FEATURE_ENV_KEYS = ['ENABLE_SKETCH_AND_GUESS', 'NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS'] as const

function localeValue(locale: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale)
}

describe('Sketch & Guess detail page (#1036)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // The page is prerendered at build time, where the flag is off. Everything
    // below has to hold in exactly that environment.
    process.env = { ...originalEnv }
    for (const key of FEATURE_ENV_KEYS) {
      delete process.env[key]
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('canonicals to the path it is served from', () => {
    // Written out rather than derived from the catalog: the catalog says
    // /games/sketch-and-guess/lobbies, and the page directory is the other half
    // of the agreement. A page under app/games/guess-my-drawing (the catalog id)
    // would canonical to a URL that 404s.
    const metadata = buildGameMetadata('guess-my-drawing')

    expect(metadata.alternates?.canonical).toBe('https://boardly.online/games/sketch-and-guess')
    expect(readFileSync(PAGE, 'utf8')).toContain("buildGameMetadata('guess-my-drawing')")
  })

  it('is in the index now that the game is released (#873)', () => {
    // This asserted the noindex until #873: the page shipped in #1036 while the
    // catalog entry was still in-development, linked from nowhere Google crawls.
    // The flip is what changed the expected value, so it is stated both ways -
    // what the page asks for, and that it no longer asks to be left out.
    expect(buildGameMetadata('guess-my-drawing').robots).toEqual({
      index: true,
      follow: true,
    })
    expect(readFileSync(PAGE, 'utf8')).not.toContain('{ index: false }')
  })

  it('describes the game the engine actually runs', () => {
    const [videoGame] = buildGameJsonLd('guess-my-drawing')

    expect(videoGame.url).toBe('https://boardly.online/games/sketch-and-guess')
    expect(videoGame.numberOfPlayers).toEqual({
      '@type': 'QuantitativeValue',
      minValue: 3,
      maxValue: 10,
    })
    // supportsBots is false, so there is no single-player mode to claim.
    expect(videoGame.playMode).toBe('MultiPlayer')
  })

  it('answers on the page the question its FAQ schema asks', () => {
    const faq = buildGameJsonLd('guess-my-drawing').find((schema) => schema['@type'] === 'FAQPage')!
    const entries = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[]

    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe(englishText('games.guess_my_drawing.seo.question'))
    expect(entries[0].acceptedAnswer.text).toBe(englishText('games.guess_my_drawing.seo.answer'))
  })

  it('renders the structured data from the catalog id, not a second copy of the copy', () => {
    const source = readFileSync(PAGE, 'utf8')

    expect(source).toContain('<GameJsonLd gameId="guess-my-drawing" />')
  })

  it('reads nothing on the server, so the route stays prerendered', () => {
    // A session or database read here turns a static page dynamic, which is the
    // same trap documented for the ad slots in CLAUDE.md.
    const source = readFileSync(PAGE, 'utf8')

    expect(source).not.toMatch(/next-auth|getServerSession|@\/lib\/db|prisma/)
    expect(source).not.toContain('force-dynamic')
    expect(source).not.toContain("'use client'")
  })

  it('uses only translation keys that exist in all four locales', () => {
    const source = readFileSync(CONTENT, 'utf8')
    const keys = [...source.matchAll(/\bt\('([^']+)'\)/g)].map((match) => match[1])

    // Guard the guard: a regex that matched nothing would make this pass empty.
    expect(keys.length).toBeGreaterThan(20)
    expect(keys).toContain('games.guess_my_drawing.detail.groupNotice')

    for (const [name, locale] of Object.entries({ en, ru, no, uk })) {
      const missing = keys.filter((key) => typeof localeValue(locale, key) !== 'string')
      expect({ locale: name, missing }).toEqual({ locale: name, missing: [] })
    }
  })

  it('never falls back to inline English', () => {
    // t('key', 'fallback') passes the parity hook and leaves three languages
    // broken, which is why the repo bans the two-argument form outright.
    const source = readFileSync(CONTENT, 'utf8')

    expect(source).not.toMatch(/\bt\('[^']+',\s*'/)
  })
})
