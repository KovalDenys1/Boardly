import { render } from '@testing-library/react'
import GuidesPage from '@/app/guides/page'
import { getCatalogAvailableGames } from '@/lib/game-catalog'
import { HOW_TO_PLAY_GUIDES } from '@/lib/guides-catalog'

jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))

// #1498: /guides was a list of cards with 177 words of its own. The section says what a
// guide covers that a game page does not, and where to read about the games no guide covers.
describe('/guides explains how the guides fit the game pages (#1498)', () => {
  const guided = new Set(HOW_TO_PLAY_GUIDES.map((guide) => guide.game))
  const unguided = getCatalogAvailableGames().filter((game) => !guided.has(game.id))

  it('renders the section with a heading and its own text', () => {
    const { container } = render(<GuidesPage />)
    const section = container.querySelector('section#guides-and-games')
    expect(section).not.toBeNull()
    expect(section!.querySelector('h2')?.textContent).toBe('Guides and game pages')
    const words = (section!.textContent ?? '').split(/\s+/).filter(Boolean).length
    expect(words).toBeGreaterThanOrEqual(100)
  })

  it('links every available game that has no how-to guide to its own page', () => {
    expect(unguided.length).toBeGreaterThan(0)
    const { container } = render(<GuidesPage />)
    const hrefs = Array.from(container.querySelectorAll('section#guides-and-games a')).map((a) => a.getAttribute('href'))
    for (const game of unguided) expect(hrefs).toContain(game.route!.replace(/\/lobbies$/, ''))
  })
})
