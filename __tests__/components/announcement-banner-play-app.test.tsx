import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { render, screen } from '@testing-library/react'
import { AnnouncementBanner } from '@/components/AnnouncementBanner'
import { AnnouncementMessage } from '@/components/AnnouncementMessage'
import { getActiveAnnouncement } from '@/lib/runtime-config'

jest.mock('@/lib/runtime-config', () => ({
  getActiveAnnouncement: jest.fn(),
}))

const mockGetActiveAnnouncement = getActiveAnnouncement as jest.MockedFunction<typeof getActiveAnnouncement>

const PURCHASE_HREFS = [
  'https://buy.stripe.com/abc',
  'https://example.com/sale',
  '/premium',
  '/premium?plan=yearly',
  '/api/stripe/checkout',
]

async function renderBanner(href: string) {
  mockGetActiveAnnouncement.mockResolvedValue({ id: 'a1', message: 'Big news', href, tone: 'info' })
  const banner = await AnnouncementBanner()
  return render(<>{banner}</>)
}

describe('AnnouncementBanner in the Play app (#1465)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.appShell
    document.body.innerHTML = ''
    jest.restoreAllMocks()
  })

  it.each(PURCHASE_HREFS)('shows the text without a link to %s inside the app', async (href) => {
    document.documentElement.dataset.appShell = 'play'
    await renderBanner(href)

    expect(screen.getByRole('status')).toHaveTextContent('Big news')
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('status')).not.toHaveTextContent('→')
  })

  it('keeps a link to a page on the site inside the app', async () => {
    document.documentElement.dataset.appShell = 'play'
    await renderBanner('/games')

    expect(screen.getByRole('link', { name: /Big news/ })).toHaveAttribute('href', '/games')
    expect(screen.getByRole('link')).not.toHaveAttribute('data-purchase-ui')
  })

  it.each([...PURCHASE_HREFS, '/games'])('keeps the link to %s on the web', async (href) => {
    await renderBanner(href)

    expect(screen.getByRole('link', { name: /Big news/ })).toHaveAttribute('href', href)
  })

  it('marks a purchase link so the app hides it before hydration, and leaves other links unmarked', async () => {
    const { unmount } = await renderBanner('/premium')
    expect(screen.getByRole('link')).toHaveAttribute('data-purchase-ui')
    unmount()

    await renderBanner('/games')
    expect(screen.getByRole('link')).not.toHaveAttribute('data-purchase-ui')
  })

  it.each([
    ['/premium', false],
    ['/games', true],
  ])('hydrates server markup for %s into the app without a mismatch', async (href, linked) => {
    const tree = <AnnouncementMessage message="Big news" href={href} />
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree)
    document.body.appendChild(container)

    document.documentElement.dataset.appShell = 'play'
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, tree)
    })

    expect(errorSpy).not.toHaveBeenCalled()
    expect(container).toHaveTextContent('Big news')
    expect(container.querySelector('a') !== null).toBe(linked)
    expect(container.querySelector('[data-purchase-ui]')).toBeNull()
    await act(async () => root?.unmount())
  })
})
