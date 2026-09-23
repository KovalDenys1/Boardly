import type { ComponentType } from 'react'
import { render } from '@testing-library/react'

import { getCatalogGames } from '@/lib/game-catalog'
import {
  ALL_CATEGORIES,
  SHORT_MODE_CATEGORIES,
  calculateScore,
  calculateTotalScore,
  getActiveCategories,
  normalizeYahtzeeMode,
  type YahtzeeCategory,
} from '@/lib/yahtzee'
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

// The scoring cards state numbers, and every one of them is recomputed here
// from lib/yahtzee.ts, so a rule change in the engine fails this file instead
// of leaving the page describing a game that no longer exists.
describe('the Yahtzee scoring section against the engine (#1077)', () => {
  const rows = en.games.yahtzee.detail.scoring.rows as Record<YahtzeeCategory, { value: string; rule: string }>
  const { upperNote, lowerNote } = en.games.yahtzee.detail.scoring
  const has = (text: string, value: number) => new RegExp(`\\b${value}\\b`).test(text)

  it('has one card for every engine category and nothing else', () => {
    expect(Object.keys(rows).sort()).toEqual([...ALL_CATEGORIES].sort())
  })

  it('gives each number row its share of the 63 that earns the bonus', () => {
    const upper = ALL_CATEGORIES.slice(0, 6)
    upper.forEach((category, index) => {
      const face = index + 1
      expect({ category, ok: has(rows[category].value, face * 3) }).toEqual({ category, ok: true })
    })
    const threeOfEach = Object.fromEntries(upper.map((category, index) => [category, (index + 1) * 3]))
    const oneShort = { ...threeOfEach, ones: 2 }
    // 63 earns 35, 62 earns nothing: the note's two numbers.
    expect(calculateTotalScore(threeOfEach) - 63).toBe(35)
    expect(calculateTotalScore(oneShort)).toBe(62)
    expect(has(upperNote, 63) && has(upperNote, 35)).toBe(true)
  })

  it('quotes the fixed values the engine pays', () => {
    expect(has(rows.fullHouse.value, calculateScore([2, 2, 3, 3, 3], 'fullHouse'))).toBe(true)
    expect(has(rows.smallStraight.value, calculateScore([1, 2, 3, 4, 6], 'smallStraight'))).toBe(true)
    expect(has(rows.largeStraight.value, calculateScore([2, 3, 4, 5, 6], 'largeStraight'))).toBe(true)
    expect(has(rows.yahtzee.value, calculateScore([4, 4, 4, 4, 4], 'yahtzee'))).toBe(true)
    expect(has(rows.onePair.value, calculateScore([6, 6, 1, 2, 3], 'onePair'))).toBe(true)
    expect(has(rows.twoPairs.value, calculateScore([6, 6, 5, 5, 1], 'twoPairs'))).toBe(true)
  })

  it('states the exclusions the engine enforces', () => {
    // Five of a kind is not a full house, and four alike is not two pairs.
    expect(calculateScore([5, 5, 5, 5, 5], 'fullHouse')).toBe(0)
    expect(rows.fullHouse.rule).toMatch(/five alike is not a full house/i)
    expect(calculateScore([4, 4, 4, 4, 2], 'twoPairs')).toBe(0)
    expect(rows.twoPairs.rule).toMatch(/four alike does not count/i)
    // Three and Four of a Kind pay the whole roll, not the matching dice.
    expect(calculateScore([3, 3, 3, 5, 6], 'threeOfKind')).toBe(20)
    expect(calculateScore([4, 4, 4, 4, 2], 'fourOfKind')).toBe(18)
  })

  it('calls the lower section the short mode, and short mode nine rows', () => {
    expect([...SHORT_MODE_CATEGORIES].sort()).toEqual(ALL_CATEGORIES.slice(6).sort())
    expect(lowerNote).toMatch(new RegExp(`\\b${NUMBER_WORDS[SHORT_MODE_CATEGORIES.length]}\\b`))
  })
})
