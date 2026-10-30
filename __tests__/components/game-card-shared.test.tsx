import { render } from '@testing-library/react'
import GameRibbon from '@/components/HomePage/GameRibbon'
import GamesClient from '@/app/(site)/games/GamesClient'
import { getCatalogGames, isAvailableCatalogEntry } from '@/lib/game-catalog'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('@/components/Footer', () => () => null)
jest.mock('@/components/GuidesSection', () => () => null)

function cardsById(container: HTMLElement): Map<string, HTMLElement> {
  return new Map(
    Array.from(container.querySelectorAll<HTMLElement>('[data-game-card]')).map((card) => [card.dataset.gameCard!, card]),
  )
}

// #1560: the home ribbon and /games drew the same game as two different cards.
describe('the game card on home and /games', () => {
  const games = getCatalogGames()
  const available = games.filter(isAvailableCatalogEntry)

  it('draws every available game with the same markup on both pages', () => {
    const home = cardsById(render(<GameRibbon />).container)
    const catalog = cardsById(render(<GamesClient games={games} />).container)

    expect(available.length).toBeGreaterThanOrEqual(11)
    for (const game of available) {
      const onHome = home.get(game.id)
      const onCatalog = catalog.get(game.id)
      expect(onHome).toBeDefined()
      expect(onCatalog).toBeDefined()
      expect(onHome!.outerHTML).toBe(onCatalog!.outerHTML)
    }
  })

  it('names a status only where it says something: coming soon, never "Available" or "Play Now"', () => {
    const catalog = cardsById(render(<GamesClient games={games} />).container)

    for (const game of games) {
      const text = catalog.get(game.id)?.textContent ?? ''
      expect(text).not.toContain('games.available')
      expect(text).not.toContain('games.playNow')
      if (game.availability === 'available') expect(text).not.toContain('games.comingSoon')
      else expect(text).toContain('games.comingSoon')
    }
  })
})
