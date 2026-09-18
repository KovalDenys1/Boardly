import type { ComponentType } from 'react'
import { render } from '@testing-library/react'

import { getCatalogGames } from '@/lib/game-catalog'
import { getActiveCategories, normalizeYahtzeeMode } from '@/lib/yahtzee'

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
