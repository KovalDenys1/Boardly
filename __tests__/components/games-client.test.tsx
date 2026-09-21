import { render, screen } from '@testing-library/react'
import GamesClient from '@/app/games/GamesClient'
import { getCatalogGames, isAvailableCatalogEntry } from '@/lib/game-catalog'
import {
  HELD_BACK_DETAIL_HREF,
  HELD_BACK_LOBBIES_ROUTE,
  heldBackCatalog,
} from '../fixtures/held-back-catalog'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))
jest.mock('@/components/Footer', () => () => null)
jest.mock('@/components/GuidesSection', () => () => null)

// #921: /games is one of the two pages Google crawls, so every available game
// card must be a real anchor to its detail page.
describe('GamesClient', () => {
  it('renders each available game card as a link to its detail page', () => {
    const games = getCatalogGames()
    render(<GamesClient games={games} />)

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    const available = games.filter(isAvailableCatalogEntry)

    expect(available.length).toBeGreaterThanOrEqual(7)
    for (const game of available) {
      expect(hrefs).toContain(game.route.replace(/\/lobbies$/, ''))
    }
    expect(hrefs).toContain('/games/rock-paper-scissors')
  })

  it('does not link games that are not available yet', () => {
    const games = getCatalogGames()
    render(<GamesClient games={games} />)

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    const unreleased = games.filter((game) => game.availability !== 'available')

    // Liar's Party was the named case here until #873 released it. Read off the
    // catalog instead: an entry the catalog has not released gets a card and no
    // anchor - checked by its id, which is how the href used to be guessed, and
    // by its route if it carries one. A game added in-development is covered on
    // its first day rather than the day someone remembers this file.
    expect(unreleased.length).toBeGreaterThan(0)
    for (const game of unreleased) {
      expect(hrefs).not.toContain(`/games/${game.id}`)
      if (game.route) {
        expect(hrefs).not.toContain(game.route.replace(/\/lobbies$/, ''))
      }
    }
    expect(hrefs.some((href) => href?.startsWith('/games/'))).toBe(true)
  })

  it('does not link a routed game the catalog has not released', () => {
    // The card's anchor hangs off `isAvailable && href !== null`, and since #873 only the
    // second half of that has a subject: the entries left in-development carry no route, so
    // `detailHref` answers null for them and the availability check is never what keeps the
    // link off the page. Deleting it left the three tests above green.
    //
    // A routed entry the catalog has not released is the case that tells the two halves
    // apart. It is also the real one: every game released so far sat in exactly this state
    // first, with its pages built and its route live, waiting on the product decision.
    const games = heldBackCatalog(getCatalogGames())
    render(<GamesClient games={games} />)

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))

    // The card is on the page - so the absences below are about the gate, not about a
    // catalog that dropped the game.
    expect(screen.getByText('games.liars_party.name')).toBeInTheDocument()
    expect(hrefs).not.toContain(HELD_BACK_DETAIL_HREF)
    expect(hrefs).not.toContain(HELD_BACK_LOBBIES_ROUTE)
    // And the released games are still linked, so the render itself is not the reason.
    expect(hrefs).toContain('/games/yahtzee')
  })

  it('does not link a promoted game that has no page (#975)', () => {
    // The href used to be guessed from the catalog id when the entry carried no
    // route, so promoting Fake Artist or Telephone Doodle rendered an anchor to
    // /games/fake-artist – a path nothing serves.
    const games = getCatalogGames({ enabledExperimental: ['fake-artist', 'telephone-doodle'] })
    render(<GamesClient games={games} />)

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))

    expect(hrefs).not.toContain('/games/fake-artist')
    expect(hrefs).not.toContain('/games/telephone-doodle')
  })
})
