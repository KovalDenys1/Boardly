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

    expect(detailHrefs).toHaveLength(7)
    for (const href of ['/games/connect-four', '/games/alias', '/games/rock-paper-scissors', ...detailHrefs]) {
      expect(hrefs).toContain(href)
    }
  })
})
