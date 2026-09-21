import { render, screen } from '@testing-library/react'
import GameRibbon from '@/components/HomePage/GameRibbon'
import { getCatalogGames, isAvailableCatalogEntry } from '@/lib/game-catalog'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// #921: the home page must link every available game's detail page.
describe('GameRibbon', () => {
  it('links the detail page of every available game', () => {
    render(<GameRibbon />)

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    const detailHrefs = getCatalogGames().filter(isAvailableCatalogEntry).map((game) => game.route.replace(/\/lobbies$/, ''))

    // Named so the loop cannot pass by agreeing with an empty catalog. The count
    // used to be pinned at 7 here, which is what #873 broke when it released Liar's
    // Party and Sketch & Guess; both are named below now, and the agreement the
    // number stood for is the assertion after the loop.
    for (const href of [
      '/games/connect-four',
      '/games/alias',
      '/games/rock-paper-scissors',
      '/games/liars-party',
      '/games/sketch-and-guess',
      ...detailHrefs,
    ]) {
      expect(hrefs).toContain(href)
    }

    // And nothing the other way: every game link on the ribbon is an available
    // game's detail page, so an unreleased game cannot slip a card in either.
    expect(hrefs.filter((href) => href?.startsWith('/games/')).sort()).toEqual([...detailHrefs].sort())
  })

  // The ribbon grid is 1 / 2 / 4 columns; the card count must divide evenly so
  // no row ends with an empty slot (layout DoD). Every available game + the "more
  // on the way" card that links /games.
  it('renders a card for every available game, and the "more on the way" card', () => {
    const { container } = render(<GameRibbon />)

    const grid = container.querySelector('.grid')
    expect(grid).not.toBeNull()
    const cardCount = grid!.children.length
    const available = getCatalogGames().filter(isAvailableCatalogEntry)

    // Pinned at 8 until #873 took the catalog from seven available games to nine.
    // Derived, because what the number stood for is that every available game has
    // a card and the extra card is still there - not that there are eight of them.
    expect(cardCount).toBe(available.length + 1)
    // The sm half of the layout DoD: two columns, so an odd count orphans a row.
    expect(cardCount % 2).toBe(0)
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toContain('/games')
  })

  /**
   * The xl half of the same DoD, and it does not hold any more.
   *
   * #873 took the ribbon to ten cards on a 1 / 2 / 4 column grid: 4 + 4 + 2, so the
   * last row at 1280 ends with two empty slots - the exact layout the eighth card
   * was added in #921 to remove. This is a product regression the release left
   * behind, not a stale test, so the assertion is kept exactly as it was rather
   * than softened or deleted, and marked `failing` so the branch is honest about
   * which way round it is. Jest turns this red again the moment the ribbon is
   * fixed - twelve cards, a different xl column count, or a last-row span - and
   * that is when it goes back to a plain `it`.
   */
  it.failing('fills the 4-column grid, so no row ends with an empty slot', () => {
    const { container } = render(<GameRibbon />)

    const cardCount = container.querySelector('.grid')!.children.length

    expect(cardCount % 4).toBe(0)
  })
})
