import { render, screen } from '@testing-library/react'
import '@/i18n'
import Footer from '@/components/Footer'

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
