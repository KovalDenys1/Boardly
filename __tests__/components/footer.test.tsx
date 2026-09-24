import { render, screen } from '@testing-library/react'
import '@/i18n'
import Footer from '@/components/Footer'
import { getCatalogAvailableGames } from '@/lib/game-catalog'

/**
 * Guards #938. The footer's Community column is where a visitor looks for the server, and
 * the link has to go through `/discord` rather than at an invite pasted into the markup –
 * that indirection is the whole point of the route.
 */
describe('Footer community links', () => {
  it('links to the Discord redirect route', () => {
    render(<Footer />)

    const discordLink = screen.getByRole('link', { name: 'Discord' })

    expect(discordLink).toHaveAttribute('href', '/discord')
    expect(discordLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('keeps the GitHub link alongside it', () => {
    render(<Footer />)

    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/KovalDenys1/Boardly'
    )
  })
})

/**
 * The footer is on every page, so its Games column is the one set of links to
 * the game pages a crawler meets everywhere. It hand-typed four games while
 * nine were live; now it lists the catalog.
 */
describe('Footer crawl links', () => {
  it('links every available game to its detail page, never to /lobbies', () => {
    const { container } = render(<Footer />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))

    const games = getCatalogAvailableGames()
    expect(games.length).toBeGreaterThanOrEqual(9)
    for (const game of games) {
      const detail = game.route!.replace(/\/lobbies$/, '')
      expect(hrefs).toContain(detail)
      expect(hrefs).not.toContain(game.route)
    }
  })

  it('links /premium and /guides – the only crawlable link to /premium on the site', () => {
    const { container } = render(<Footer />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))

    expect(hrefs).toContain('/premium')
    expect(hrefs).toContain('/guides')
  })
})

/**
 * #1162: the withdrawal information has to be reachable from every page, next
 * to the terms it belongs with, not only from the block on /premium.
 */
describe('Footer legal links', () => {
  it('lists privacy, terms and the right of withdrawal', () => {
    render(<Footer />)

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Right of withdrawal' })).toHaveAttribute('href', '/withdrawal')
  })
})
