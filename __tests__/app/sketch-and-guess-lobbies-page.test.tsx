import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import SketchAndGuessLobbiesPage from '@/app/games/sketch-and-guess/lobbies/page'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const mockPush = jest.fn()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChannel: any = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn().mockReturnThis(),
}
const mockSupabaseClient = {
  channel: jest.fn().mockReturnValue(mockChannel),
  removeChannel: jest.fn().mockResolvedValue({}),
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => mockSupabaseClient),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
  }),
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

function mockJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
  } as unknown as Response
}

describe('Sketch & Guess lobby list page (#971)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    // The flag promotes the game into the public catalog, which is exactly the
    // state in which the old denylist check answered "you can create one".
    process.env = { ...originalEnv, NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS: 'true' }
    ;(useSession as jest.Mock).mockReturnValue({ status: 'authenticated' })
    ;(fetchWithGuest as jest.Mock).mockResolvedValue(mockJsonResponse({ lobbies: [] }))
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('sends the visitor to the game\'s own create form once it has one (#1035)', async () => {
    // Guard on the precondition: with the flag on the game is publicly
    // available, so the denylist says nothing is wrong with it.
    expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(false)

    render(<SketchAndGuessLobbiesPage />)

    await waitFor(() => {
      expect(fetchWithGuest).toHaveBeenCalledWith('/api/lobby?gameType=sketch_and_guess')
    })

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).toBeNull()
    })

    // The heading is the namespaced key because `t` is mocked to echo it.
    const createCard = screen.getByRole('button', {
      name: /games\.guess_my_drawing\.lobbies\.createNewLobby/i,
    })
    expect(createCard).toHaveAttribute('aria-disabled', 'false')

    fireEvent.click(createCard)

    // #1035 gave the entry a lobbyCreateConfig, so /lobby/create builds this
    // game's form instead of falling back to Yahtzee's.
    expect(mockPush).toHaveBeenCalledWith('/lobby/create?gameType=sketch_and_guess')
  })

  it('still refuses to send the visitor anywhere while the game is in-development', async () => {
    // The #971 regression itself: without the flag the catalog entry is
    // in-development, the create page would answer with the default game, and
    // the card has to stay shut whatever config the entry now carries.
    delete process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS
    expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(true)

    render(<SketchAndGuessLobbiesPage />)

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).toBeNull()
    })

    const createCard = screen.getByRole('button', { name: /Lobby creation unavailable/i })
    expect(createCard).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(createCard)

    expect(mockPush).not.toHaveBeenCalled()
  })
})
