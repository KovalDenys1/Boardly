import { render, screen } from '@testing-library/react'
import GamesClient from '@/app/games/GamesClient'
import { getCatalogGames, isAvailableCatalogEntry } from '@/lib/game-catalog'

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
    render(<GamesClient games={getCatalogGames()} />)

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))

    expect(hrefs).not.toContain('/games/liars-party')
    expect(hrefs.some((href) => href?.startsWith('/games/'))).toBe(true)
  })
})
