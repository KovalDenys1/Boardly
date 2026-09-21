import { readFileSync } from 'node:fs'
import path from 'node:path'

import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

/**
 * #1061. `/games/alias`, `/games/liars-party` and `/games/rock-paper-scissors`
 * used to be server pages that handed ~40 English literals to GameDetailPage as
 * props, so a Russian visitor got a Russian header around an English hero. The
 * copy now lives in a client `<Game>DetailContent` wrapper behind `t()`.
 *
 * These are the two things that pattern can still get wrong: a key that exists
 * in English and nowhere else (the audit walks JSX, not locale files, so it
 * cannot see that), and a literal left behind in a prop the audit does not
 * treat as user-visible - `facts`, `intro`, `steps` and `benefits` are plain
 * object properties, which is exactly why the three files were allowlisted.
 */

const root = process.cwd()

const CONTENT_FILES = {
  alias: path.join(root, 'app/games/alias/AliasDetailContent.tsx'),
  'liars-party': path.join(root, 'app/games/liars-party/LiarsPartyDetailContent.tsx'),
  'rock-paper-scissors': path.join(
    root,
    'app/games/rock-paper-scissors/RockPaperScissorsDetailContent.tsx'
  ),
} as const

const PAGE_FILES = {
  alias: path.join(root, 'app/games/alias/page.tsx'),
  'liars-party': path.join(root, 'app/games/liars-party/page.tsx'),
  'rock-paper-scissors': path.join(root, 'app/games/rock-paper-scissors/page.tsx'),
} as const

/** Props whose value the visitor reads. Each one has to be a `t()` call. */
const COPY_PROPS = [
  'gameName',
  'title',
  'description',
  'iconLabel',
  'primaryCtaLabel',
  'introTitle',
  'benefitsTitle',
  'groupNotice',
] as const

function localeValue(locale: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale)
}

describe.each(Object.entries(CONTENT_FILES))('%s detail content (#1061)', (slug, file) => {
  const source = readFileSync(file, 'utf8')

  it('uses only translation keys that exist in all four locales', () => {
    const keys = [...source.matchAll(/\bt\('([^']+)'\)/g)].map((match) => match[1])

    // Guard the guard: a regex that matched nothing would make this pass empty.
    expect(keys.length).toBeGreaterThan(25)

    for (const [name, locale] of Object.entries({ en, ru, no, uk })) {
      const missing = keys.filter((key) => typeof localeValue(locale, key) !== 'string')
      expect({ locale: name, missing }).toEqual({ locale: name, missing: [] })
    }
  })

  it('never falls back to inline English', () => {
    // t('key', 'fallback') passes the parity hook and leaves three languages
    // broken, which is why the repo bans the two-argument form outright.
    expect(source).not.toMatch(/\bt\('[^']+',\s*'/)
  })

  it('passes no English literal in a copy prop', () => {
    for (const prop of COPY_PROPS) {
      expect(source).not.toMatch(new RegExp(`\\b${prop}=["']`))
    }
  })

  it('passes no English literal inside facts, intro, steps or benefits', () => {
    // Only the element itself - the import specifiers above it are module
    // paths, not copy. The player counts ('4–16') are the one kind of bare
    // string that belongs inside: digits and an en dash read the same in
    // every locale, which is why the filter below keeps only words.
    const element = source.slice(source.indexOf('<GameDetailPage'))
    expect(element).toContain('facts={[')

    const literals = [...element.matchAll(/'([^']*)'/g)]
      .map((match) => match[1])
      .filter((value) => /\p{L}{2}/u.test(value))
      // a translation key is the point, and a route is not copy
      .filter((value) => !value.startsWith('games.') && !value.startsWith('/'))

    expect(literals).toEqual([])
  })
})

describe.each(Object.entries(PAGE_FILES))('%s server page (#1061)', (slug, file) => {
  const source = readFileSync(file, 'utf8')

  it('keeps its metadata export and its JSON-LD on the server', () => {
    expect(source).toContain('export const metadata: Metadata')
    expect(source).toContain('<GameJsonLd gameId=')
    expect(source).not.toContain("'use client'")
  })

  it('hands the copy to the client wrapper instead of holding it', () => {
    expect(source).toContain('DetailContent')
    expect(source).not.toContain('<GameDetailPage')
  })
})

describe('the i18n allowlist no longer excuses these pages (#1061)', () => {
  it('has dropped all three entries', () => {
    const allowlist = JSON.parse(
      readFileSync(path.join(root, 'scripts/i18n-allowlist.json'), 'utf8')
    ) as { files: Record<string, string> }

    for (const slug of Object.keys(PAGE_FILES)) {
      expect(Object.keys(allowlist.files)).not.toContain(`app/games/${slug}/page.tsx`)
    }
  })
})
