/**
 * #1466: the list behind the profile's Blocked players section and the guest menu's
 * dialog. The viewer here is a guest, whose list is kept on this device.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import BlockedPlayersList from '@/components/BlockedPlayersList'
import { showToast } from '@/lib/i18n-toast'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.date ? `${key}:${String(options.date)}` : key),
    i18n: { language: 'en' },
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn() },
}))

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

const session = useSession as jest.Mock

function storeBlocks(entries: { id: string; username: string; blockedAt: string }[]) {
  window.localStorage.setItem('boardly_blocked_players', JSON.stringify(entries))
}

function storedIds(): string[] {
  const raw = window.localStorage.getItem('boardly_blocked_players')
  return raw ? (JSON.parse(raw) as { id: string }[]).map((entry) => entry.id) : []
}

describe('BlockedPlayersList (#1466)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
    session.mockReturnValue({ data: null, status: 'unauthenticated' })
  })

  it('lists each blocked player with the date, newest first, and Unblock removes one', async () => {
    storeBlocks([
      { id: 'u-bob', username: 'Bob', blockedAt: '2026-10-01T10:00:00.000Z' },
      { id: 'u-eve', username: 'Eve', blockedAt: '2026-10-17T10:00:00.000Z' },
    ])

    render(<BlockedPlayersList />)

    const items = await screen.findAllByRole('listitem')
    expect(items.map((item) => within(item).getByText(/^(Bob|Eve)$/).textContent)).toEqual(['Eve', 'Bob'])
    expect(within(items[1]).getByText(/^blockedPlayers\.blockedOn:.*2026/)).toBeTruthy()

    fireEvent.click(within(items[1]).getByRole('button', { name: 'blockedPlayers.unblock' }))

    await waitFor(() => expect(screen.queryByText('Bob')).toBeNull())
    expect(screen.getByText('Eve')).toBeTruthy()
    expect(storedIds()).toEqual(['u-eve'])
  })

  it('names the player each Unblock button is for', async () => {
    storeBlocks([{ id: 'u-bob', username: 'Bob', blockedAt: '2026-10-01T10:00:00.000Z' }])

    render(<BlockedPlayersList />)

    const button = await screen.findByRole('button', { name: 'blockedPlayers.unblock' })
    expect(button).toHaveAccessibleDescription('Bob')
  })

  it('keeps the entry and says so when the account could not unblock', async () => {
    session.mockReturnValue({ data: { user: { id: 'me' } }, status: 'authenticated' })
    const originalFetch = global.fetch
    global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? new Response('{}', { status: 500 })
        : new Response(
            JSON.stringify({ blocks: [{ id: 'u-bob', username: 'Bob', blockedAt: '2026-10-01T10:00:00.000Z' }] }),
            { status: 200 }
          )
    ) as typeof fetch

    try {
      render(<BlockedPlayersList />)

      fireEvent.click(await screen.findByRole('button', { name: 'blockedPlayers.unblock' }))

      await waitFor(() => expect(showToast.error).toHaveBeenCalledWith('errors.generic'))
      expect(screen.getByText('Bob')).toBeTruthy()
    } finally {
      global.fetch = originalFetch
    }
  })

  it('says so when nobody is blocked', async () => {
    render(<BlockedPlayersList />)

    expect(await screen.findByText('blockedPlayers.empty')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
