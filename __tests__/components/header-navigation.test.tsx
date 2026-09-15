import { fireEvent, render, screen } from '@testing-library/react'
import { HeaderNavigation } from '@/components/Header/HeaderNavigation'

let mockPathname = '/'

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('HeaderNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/'
  })

  it('keeps the full navigation hidden until the large breakpoint', () => {
    const { container } = render(<HeaderNavigation isAuthenticated={false} isGuest={false} />)

    const navigationContainer = container.firstChild as HTMLElement | null

    expect(screen.getByRole('link', { name: 'header.home' })).toBeTruthy()
    expect(navigationContainer?.className).toContain('hidden')
    expect(navigationContainer?.className).toContain('xl:flex')
  })

  // #921: the nav must be crawlable, so every item is a real anchor with an href.
  it('renders every nav item as an anchor with its route', () => {
    render(<HeaderNavigation isAuthenticated={false} isGuest={false} />)

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))

    expect(hrefs).toEqual(['/', '/games', '/lobby', '/leaderboard', '/guides'])
  })

  it('lets public routes through without the auth prompt', () => {
    const onUnauthClick = jest.fn()
    render(<HeaderNavigation isAuthenticated={false} isGuest={false} onUnauthClick={onUnauthClick} />)

    fireEvent.click(screen.getByRole('link', { name: 'header.games' }))

    expect(onUnauthClick).not.toHaveBeenCalled()
  })
})
