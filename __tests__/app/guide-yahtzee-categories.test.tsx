import type { ComponentType } from 'react'
import { render } from '@testing-library/react'

import { getCatalogGames } from '@/lib/game-catalog'
import { getActiveCategories, normalizeYahtzeeMode } from '@/lib/yahtzee'
import en from '@/locales/en'

// The guide layout ends with an ad slot and the site footer, which want a
// session and a translation context they have no part in here.
jest.mock('@/components/AdSlot', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/Footer', () => ({
  __esModule: true,
  default: () => null,
}))

/** The roundups that pitch Yahtzee to a reader who has not played it here yet. */
const ROUNDUPS = ['best-online-games-for-game-night', 'best-2-player-games-online']

const NUMBER_WORDS: Record<number, string> = { 9: 'nine', 15: 'fifteen' }

function visibleText(slug: string): string {
  const Page = require(`../../app/guides/${slug}/page`).default as ComponentType
  const { container } = render(<Page />)
  const clone = container.cloneNode(true) as HTMLElement
  // JSON-LD lives in <script> children, so its copy of the prose would answer
  // every assertion about what a visitor can read.
  clone.querySelectorAll('script').forEach((script) => script.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// #973: both roundups said "fill 15 scoring categories" while the lobby form
// defaults to short mode, so a reader who followed the link and made a game got
// nine. Neither number is wrong; naming one without its mode is.
describe('roundup guides against the Yahtzee engine (#973)', () => {
  const yahtzee = getCatalogGames().find((game) => game.gameType === 'yahtzee')
  const defaultMode = normalizeYahtzeeMode(yahtzee?.lobbyCreateConfig?.gameModes?.default)
  const defaultCount = getActiveCategories(defaultMode).length
  const classicCount = getActiveCategories('classic').length

  const counted = (text: string) =>
    text
      // textContent runs one element straight into the next, so the split
      // cannot rely on a space following the full stop.
      .split(/(?<=\.)\s*/)
      .filter((sentence) => /categor/i.test(sentence) && /\d|nine|fifteen/i.test(sentence))

  const names = (sentence: string, count: number) =>
    new RegExp(`\\b(${count}|${NUMBER_WORDS[count]})\\b`, 'i').test(sentence)

  it('the lobby form still opens Yahtzee in a mode with fewer categories than classic', () => {
    // The whole point of the bug: if this ever stops being true the guides can
    // go back to one number, and this test should be the thing that says so.
    expect(defaultMode).toBe('short')
    expect(defaultCount).toBeLessThan(classicCount)
  })

  it.each(ROUNDUPS)('%s names the mode behind every category count it quotes', (slug) => {
    const sentences = counted(visibleText(slug))

    expect(sentences.length).toBeGreaterThan(0)
    for (const sentence of sentences) {
      // The count a new lobby actually gives has to be there.
      expect({ slug, sentence, namesDefault: names(sentence, defaultCount) }).toEqual({
        slug,
        sentence,
        namesDefault: true,
      })
      // And the classic count may only appear next to the word "classic".
      if (names(sentence, classicCount)) {
        expect({ slug, sentence, namesClassic: /classic/i.test(sentence) }).toEqual({
          slug,
          sentence,
          namesClassic: true,
        })
      }
    }
  })
})

/** Every English string under a locale node, flattened. */
function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  return Object.values(node as Record<string, unknown>).flatMap(strings)
}

// #1077: the game page broke the same rule editorially – its intro promised
// "15 different categories" to a visitor whose first lobby would have nine.
// The page is the one Google ranks, so it is held to the roundups' bar, over
// every string it can render: the detail copy, the direct answer and the FAQ.
describe('the Yahtzee game page against the engine (#973, #1077)', () => {
  const yahtzee = getCatalogGames().find((game) => game.gameType === 'yahtzee')
  const defaultCount = getActiveCategories(
    normalizeYahtzeeMode(yahtzee?.lobbyCreateConfig?.gameModes?.default)
  ).length
  const classicCount = getActiveCategories('classic').length
  const copy = [...strings(en.games.yahtzee.detail), ...strings(en.games.yahtzee.seo)]

  const sentences = copy
    .flatMap((text) => text.split(/(?<=[.;])\s+/))
    .filter((sentence) => /categor/i.test(sentence) && /\d|nine|fifteen/i.test(sentence))

  const names = (sentence: string, count: number) =>
    new RegExp(`\\b(${count}|${NUMBER_WORDS[count]})\\b`, 'i').test(sentence)

  it('quotes a category count somewhere, so the rule below is not vacuous', () => {
    expect(sentences.length).toBeGreaterThan(0)
  })

  it('names the default count whenever it names one, and the classic count only beside "classic"', () => {
    for (const sentence of sentences) {
      expect({ sentence, namesDefault: names(sentence, defaultCount) }).toEqual({ sentence, namesDefault: true })
      if (names(sentence, classicCount)) {
        expect({ sentence, namesClassic: /classic/i.test(sentence) }).toEqual({ sentence, namesClassic: true })
      }
    }
  })

  it('never promises a bonus for a second Yahtzee', () => {
    // lib/yahtzee.ts scores the box once, at 50, and has no joker rule (#964).
    for (const text of copy) expect(text).not.toMatch(/\b100\b|yahtzee bonus|joker/i)
  })
})
