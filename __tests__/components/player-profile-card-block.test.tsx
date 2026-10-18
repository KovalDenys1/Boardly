/**
 * #1466: a player can be blocked from their card, in the waiting room and, through
 * GamePlayerCard, on every game screen. Here the viewer is a guest, whose list is kept
 * on this device.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import PlayerProfileCard from '@/components/PlayerProfileCard'
import { getGuestData } from '@/lib/client/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn() },
}))

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

jest.mock('@/lib/client/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn((input: RequestInfo | URL, init?: RequestInit) => global.fetch(input, init)),
  getGuestData: jest.fn(),
}))

const session = useSession as jest.Mock
const guestData = getGuestData as jest.Mock

function mockCard(overrides: Record<string, unknown> = {}) {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        userId: 'u2',
        username: 'Bob',
        image: null,
        publicProfileId: null,
        isGuest: true,
        isPremium: false,
        relation: 'login_required',
        ...overrides,
      }),
      { status: 200 }
    )
  ) as typeof fetch
}

function storedIds(): string[] {
  const raw = window.localStorage.getItem('boardly_blocked_players')
  return raw ? (JSON.parse(raw) as { id: string }[]).map((entry) => entry.id) : []
}

describe('PlayerProfileCard block action (#1466)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
    session.mockReturnValue({ data: null, status: 'unauthenticated' })
    guestData.mockReturnValue({ guestId: 'guest_me', guestName: 'Me', guestToken: 't' })
  })

  afterEach(() => jest.restoreAllMocks())

  afterAll(() => {
    global.fetch = originalFetch
  })

  it("offers Block on another player's card, and Block then Unblock toggles it", async () => {
    mockCard()
    render(<PlayerProfileCard userId="u2" onClose={jest.fn()} />)

    const block = await screen.findByRole('button', { name: 'profile.playerCard.block' })
    await waitFor(() => expect((block as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(block)

    const unblock = await screen.findByRole('button', { name: 'profile.playerCard.unblock' })
    expect(storedIds()).toEqual(['u2'])

    fireEvent.click(unblock)
    expect(await screen.findByRole('button', { name: 'profile.playerCard.block' })).toBeTruthy()
    expect(storedIds()).toEqual([])
  })

  it('sits beside Report in the footer row', async () => {
    mockCard()
    render(<PlayerProfileCard userId="u2" onClose={jest.fn()} />)
    const block = await screen.findByRole('button', { name: 'profile.playerCard.block' })
    const report = screen.getByRole('button', { name: 'report.reportPlayer' })
    expect(block.parentElement).toBe(report.parentElement)
  })

  it('offers no Block on your own card', async () => {
    session.mockReturnValue({ data: { user: { id: 'viewer_1' } }, status: 'authenticated' })
    guestData.mockReturnValue(null)
    mockCard({ userId: 'viewer_1', relation: 'self', isGuest: false })
    render(<PlayerProfileCard userId="viewer_1" onClose={jest.fn()} />)
    await screen.findByText('Bob')
    expect(screen.queryByRole('button', { name: 'profile.playerCard.block' })).toBeNull()
  })

  it("offers no Block on a guest's own card either, which the card API does not mark as self", async () => {
    mockCard({ userId: 'guest_me' })
    render(<PlayerProfileCard userId="guest_me" onClose={jest.fn()} />)
    await screen.findByText('Bob')
    expect(screen.queryByRole('button', { name: 'profile.playerCard.block' })).toBeNull()
  })

  it('says so when the block could not be kept', async () => {
    mockCard()
    jest.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    render(<PlayerProfileCard userId="u2" onClose={jest.fn()} />)

    const block = await screen.findByRole('button', { name: 'profile.playerCard.block' })
    await waitFor(() => expect((block as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(block)

    await waitFor(() => expect(showToast.error).toHaveBeenCalledWith('chat.blockFailed', undefined, { player: 'Bob' }))
    expect(screen.getByRole('button', { name: 'profile.playerCard.block' })).toBeTruthy()
  })
})
