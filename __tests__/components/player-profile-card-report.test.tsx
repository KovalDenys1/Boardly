/**
 * #1172: the player card is the menu a player is reported from, in the waiting room
 * and, through GamePlayerCard, on every game screen.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import PlayerProfileCard from '@/components/PlayerProfileCard'
import { getGuestData } from '@/lib/client/fetch-with-guest'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

jest.mock('@/lib/client/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
  getGuestData: jest.fn(),
}))

const session = useSession as jest.Mock
const guestData = getGuestData as jest.Mock

function cardResponse(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u2',
    username: 'Bob',
    image: 'https://cdn.example/bob.png',
    publicProfileId: null,
    isGuest: true,
    isPremium: false,
    gamesPlayed: 0,
    wins: 0,
    winRate: 0,
    favouriteGame: null,
    relation: 'login_required',
    ...overrides,
  }
}

function mockCard(body: Record<string, unknown>) {
  global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })) as typeof fetch
}

describe('PlayerProfileCard report action (#1172)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    session.mockReturnValue({ data: { user: { id: 'viewer_1' } }, status: 'authenticated' })
    guestData.mockReturnValue(null)
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it("offers Report on another player's card, and drills down into the form with what the card shows", async () => {
    mockCard(cardResponse())
    render(<PlayerProfileCard userId="u2" onClose={jest.fn()} reportContext={{ lobbyCode: '4821' }} />)

    fireEvent.click(await screen.findByRole('button', { name: 'report.reportPlayer' }))

    expect(screen.getByText('report.title')).toBeTruthy()
    expect(screen.getByLabelText('report.targets.username')).toBeTruthy()
    expect(screen.getByLabelText('report.targets.avatar')).toBeTruthy()
    expect(screen.queryByLabelText('report.targets.drawing')).toBeNull()

    // Back to the card, not out of the menu.
    fireEvent.click(screen.getByRole('button', { name: 'report.back' }))
    expect(screen.getByRole('button', { name: 'report.reportPlayer' })).toBeTruthy()
  })

  it("offers the drawer's drawing first when the card was opened from their Sketch & Guess seat", async () => {
    mockCard(cardResponse({ image: null }))
    render(
      <PlayerProfileCard
        userId="u2"
        onClose={jest.fn()}
        reportContext={{ lobbyCode: '4821', drawing: { gameId: 'g1', round: 3 } }}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: 'report.reportPlayer' }))
    const options = screen.getAllByRole('radio').filter((input) => (input as HTMLInputElement).name.endsWith('-target'))
    expect(options.map((input) => (input as HTMLInputElement).value)).toEqual(['drawing', 'username'])
  })

  it('offers no Report on your own card', async () => {
    mockCard(cardResponse({ userId: 'viewer_1', relation: 'self' }))
    render(<PlayerProfileCard userId="viewer_1" onClose={jest.fn()} />)
    await screen.findByText('Bob')
    expect(screen.queryByRole('button', { name: 'report.reportPlayer' })).toBeNull()
  })

  it("offers no Report on a guest's own card either, which the card API does not mark as self", async () => {
    session.mockReturnValue({ data: null, status: 'unauthenticated' })
    guestData.mockReturnValue({ guestId: 'guest_me', guestName: 'Me', guestToken: 't' })
    mockCard(cardResponse({ userId: 'guest_me' }))
    render(<PlayerProfileCard userId="guest_me" onClose={jest.fn()} />)
    await screen.findByText('Bob')
    expect(screen.queryByRole('button', { name: 'report.reportPlayer' })).toBeNull()
  })

  it('lets a guest report another player', async () => {
    session.mockReturnValue({ data: null, status: 'unauthenticated' })
    guestData.mockReturnValue({ guestId: 'guest_me', guestName: 'Me', guestToken: 't' })
    mockCard(cardResponse())
    render(<PlayerProfileCard userId="u2" onClose={jest.fn()} />)
    expect(await screen.findByRole('button', { name: 'report.reportPlayer' })).toBeTruthy()
  })

  it('offers no Report to a visitor with no identity to report as', async () => {
    session.mockReturnValue({ data: null, status: 'unauthenticated' })
    mockCard(cardResponse())
    render(<PlayerProfileCard userId="u2" onClose={jest.fn()} />)
    await screen.findByText('Bob')
    expect(screen.queryByRole('button', { name: 'report.reportPlayer' })).toBeNull()
  })
})
